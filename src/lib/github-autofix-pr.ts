import { Octokit } from "@octokit/rest";
import type { FirewallAutofixPullRequestResponse } from "@/lib/firewall-contract";
import {
  AutofixTscPreflightError,
  assertAutofixTscPreflightPasses,
} from "@/lib/autofix-tsc-preflight";
import { agenticFixWithRetry, isAgenticClientDbEnabled } from "@/lib/agentic-fix-with-retry";
import { finalizeAutofixWrites, healAutofixWrites } from "@/lib/autofix-write-validation";
import { isTestSourcePath, isTestSuiteSource, planAutofix } from "@/lib/firewall-autofix";
import { recordOpenAutofixPullRequest } from "@/lib/firewall-open-prs";
import { resolveGithubRepoAccessToken } from "@/lib/github-app-client";
import { assertBaseBranchReadyForAutofix } from "@/lib/github-base-ci-gate";
import { toGitHubOwnerRepo } from "@/lib/github-repo-ref";
import { isFirewallSourcePath, isRepositoryTextPath, readGitHubSourceFile, readGitHubTextFile } from "@/lib/github-source-file";
import {
  captureOriginalSecurityFinding,
  verifySecurityFixResolved,
  type PostFixVerifyTarget,
} from "@/lib/post-fix-security-verify";
import {
  verifyPvimFixResolved,
  type PvimPostFixVerifyOptions,
  type PvimPostFixVerifyTarget,
} from "@/lib/pvim/pvim-post-fix-verify";
import { autopilotBranchName, runAutopilotFix, type AutopilotFinding } from "@/lib/provix-autopilot";
import {
  isFixtureCoveredClientQuery,
  isServerActionFilePath,
  isSupportingHelperPath,
  mergeEnvExample,
  mergeServerAction,
  missingSupportingHelperWrites,
  planSecurityFix,
  resolveSecurityFixLayout,
  secretLeakMessage,
  secretLeakPullRequestSection,
  serverActionFilePath,
  type SecurityCategory,
  type SecurityFixPlan,
  type SecurityFinding,
  type SecurityScanFile,
} from "@/lib/scanner/security-suite";

const TSCONFIG_CANDIDATES = ["tsconfig.json", "tsconfig.app.json", "jsconfig.json"] as const;

/** Accept full or abbreviated Git object ids (and SHA-256). Empty/omitted → null. */
export function normalizeCommitSha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^[0-9a-f]{7,40}$/.test(trimmed) || /^[0-9a-f]{64}$/.test(trimmed)) return trimmed;
  return null;
}

export function pinnedBaseMismatchMessage(base: string, pinned: string, head: string): string {
  const shortPin = pinned.slice(0, 12);
  const shortHead = head.slice(0, 12);
  return (
    `The repository default branch \`${base}\` moved since this finding was scanned ` +
    `(pinned ${shortPin}…, current ${shortHead}…). Re-run the scan on the current tip and open the fix again. ` +
    "No branch or pull request was created."
  );
}

export type PvimPublishVerification = PvimPostFixVerifyTarget &
  Pick<PvimPostFixVerifyOptions, "analyze" | "clientDeps">;

type PublishVerification = {
  target: PostFixVerifyTarget;
  scan?: (files: readonly SecurityScanFile[]) => SecurityFinding[];
  /** When set, PVIM re-analysis supplements Provix post-fix verification. */
  pvim?: PvimPublishVerification;
};

async function readRepoTsconfigContents(
  repoUrl: string,
  auth: string,
  ref?: string | null
): Promise<string[]> {
  const texts: string[] = [];
  for (const path of TSCONFIG_CANDIDATES) {
    const result = await readGitHubTextFile(repoUrl, path, {
      auth,
      ...(ref ? { ref } : {}),
    });
    if (result.ok) texts.push(result.content);
  }
  return texts;
}

function githubReadOptions(auth: string, ref?: string | null) {
  return ref ? { auth, ref } : { auth };
}

const MAX_CONTENT = 1_500_000;

type PrResult = {
  status: number;
  body: FirewallAutofixPullRequestResponse;
};

function statusOf(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
}

function githubResponseMessage(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    const data = (error as { response?: { data?: { message?: unknown } } }).response?.data;
    if (typeof data?.message === "string" && data.message.trim()) return data.message.trim();
  }
  return error instanceof Error ? error.message : "Unknown GitHub error";
}

function failureMessage(error: unknown): string {
  const status = statusOf(error);
  const raw = error instanceof Error ? error.message : "";
  if (status === 401) {
    return "GitHub rejected Provix credentials. Reinstall the GitHub App on this repository.";
  }
  if (status === 403 && /rate limit/i.test(raw)) {
    return "GitHub rate limit reached. Wait and try again.";
  }
  if (status === 403) {
    return "Provix cannot create a branch or pull request on this repository. Update the GitHub App install to include this repo with Contents and Pull requests write access.";
  }
  if (status === 404) {
    return "GitHub could not find that repository or branch with the Provix App install. Confirm the app is installed on this repo (private repos look missing without access).";
  }
  if (status === 422) {
    return "GitHub rejected the pull request. The branch may already exist, or the split did not change any files.";
  }
  return "The pull request could not be opened.";
}

function branchName(filePath: string): string {
  const slug = filePath
    .replace(/\.(tsx|ts|jsx|js)$/i, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
    .toLowerCase();
  return `provix/split-${slug || "module"}-${Date.now().toString(36)}`;
}

/** Collapse AST finding / plan text to a single sentence for the PR header. */
function oneSentence(text: string, fallback: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  const match = cleaned.match(/^(.+?[.!?])(?:\s|$)/);
  const sentence = (match?.[1] ?? cleaned).trim();
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

const PROVIX_VERIFICATION_BADGES =
  "`✅ AST Syntax Verified` | `✅ tsc --noEmit Passed` | `✅ Post-Security Re-scanned`";

/**
 * Standardized 3-line header for every automated Provix PR.
 * Verification badges stay static; vulnerability/fix come from AST finding data.
 */
export function buildProvixHealPullRequestHeader(vulnerability: string, fix: string): string {
  return [
    "### 🛡️ Provix Automated Security & Architecture Heal",
    `- **The Vulnerability:** ${oneSentence(vulnerability, "An AST security or architecture finding was detected.")}`,
    `- **The Fix:** ${oneSentence(fix, "Applied a surgical patch for the reported finding.")}`,
    `- **Verification:** ${PROVIX_VERIFICATION_BADGES}`,
  ].join("\n");
}

function architectureFixSentence(filePath: string, summary: string, writes: Array<{ filePath: string }>): string {
  const errorHandling = writes.length === 1;
  if (errorHandling) {
    return oneSentence(
      summary,
      `Wrapped unhandled async database and fetch calls in \`${filePath}\` so failures return an error response.`
    );
  }
  return oneSentence(
    summary,
    `Split \`${filePath}\` into separate modules and replaced that file with a barrel that re-exports them.`
  );
}

function architectureVulnerabilitySentence(filePath: string, writes: Array<{ filePath: string }>): string {
  const errorHandling = writes.length === 1;
  return errorHandling
    ? `Unhandled async database or fetch calls in \`${filePath}\` can become unhandled rejections.`
    : `Architectural bloat in \`${filePath}\` concentrates too many responsibilities in one module.`;
}

function securityFixSentence(category: SecurityCategory | undefined, summary: string): string {
  if (category === "SECRET_LEAK") {
    return "Moved the hardcoded secret to an environment variable reference and redacted it from source.";
  }
  if (category === "VULNERABLE_DEPENDENCY") {
    return "Updated or removed the vulnerable dependency while leaving unrelated packages intact.";
  }
  if (category === "CLIENT_DB_EXPOSURE") {
    return "Moved the client-side database query behind an authenticated server action.";
  }
  if (category === "INSECURE_AUTH_SESSION") {
    return "Replaced supabase.auth.getSession() with supabase.auth.getUser() and updated session destructuring to user.";
  }
  return oneSentence(summary, "Applied a surgical patch for the reported finding.");
}

/** Prefer the AST finding message; fall back to a category one-liner (never raw code snippets). */
function securityVulnerabilitySentence(
  category: SecurityCategory | undefined,
  findingMessage: string | undefined,
  summary: string
): string {
  const fromFinding = findingMessage?.replace(/\s+/g, " ").trim();
  if (fromFinding) {
    return oneSentence(fromFinding, "An AST security finding was detected.");
  }
  if (category === "SECRET_LEAK") {
    return "A hardcoded secret was exposed in source by AST analysis.";
  }
  if (category === "VULNERABLE_DEPENDENCY") {
    return "A vulnerable or deprecated dependency was detected by AST analysis.";
  }
  if (category === "CLIENT_DB_EXPOSURE") {
    return "A client component queries the database directly without an authenticated server action.";
  }
  if (category === "INSECURE_AUTH_SESSION") {
    return "Server-side code calls supabase.auth.getSession() instead of revalidating with getUser().";
  }
  return oneSentence(summary, "An AST security or architecture finding was detected.");
}

function autopilotVulnerabilitySentence(
  finding: AutopilotFinding,
  fixSummary: string
): string {
  const rule = finding.rule?.replace(/\s+/g, " ").trim();
  if (rule && rule.length > 3 && !/[;=<>{}()]/.test(rule)) {
    return oneSentence(
      /[.!?]$/.test(rule) ? rule : `${rule} was detected by Provix AST analysis.`,
      fixSummary
    );
  }
  if (finding.category === "SECRET_LEAK") {
    return "A hardcoded secret was exposed in source by AST analysis.";
  }
  if (finding.category === "VULNERABLE_DEPENDENCY") {
    return "A vulnerable or deprecated dependency was detected by AST analysis.";
  }
  if (finding.category === "CLIENT_DB_EXPOSURE") {
    return "A client component queries the database directly without an authenticated server action.";
  }
  if (finding.category === "INSECURE_AUTH_SESSION") {
    return "Server-side code calls supabase.auth.getSession() instead of revalidating with getUser().";
  }
  if (
    finding.rule === "Architectural Bloat" ||
    finding.category === "ARCHITECTURAL_BLOAT" ||
    finding.category === "ARCHITECTURE" ||
    finding.category === "Architectural Bloat"
  ) {
    return `Architectural bloat in \`${finding.filePath}\` concentrates too many responsibilities in one module.`;
  }
  return oneSentence(fixSummary, "An AST security or architecture finding was detected.");
}

function pullRequestBody(filePath: string, summary: string, writes: Array<{ filePath: string }>): string {
  const files = writes.map((file) => `- \`${file.filePath}\``).join("\n");
  const errorHandling = writes.length === 1;
  return [
    buildProvixHealPullRequestHeader(
      architectureVulnerabilitySentence(filePath, writes),
      architectureFixSentence(filePath, summary, writes)
    ),
    "",
    "### Files in this pull request",
    files,
    "",
    errorHandling
      ? "Review the diff before merging."
      : "The original declarations stay exported from the same path. Review the diff before merging.",
    "",
    "Generated by Provix.",
  ].join("\n");
}

export async function openAutofixPullRequest(
  repoInput: string,
  filePath: string,
  accessToken?: string
): Promise<PrResult> {
  const ownerRepo = toGitHubOwnerRepo(repoInput);
  const [owner, repo] = ownerRepo?.split("/") ?? [];
  if (!ownerRepo || !owner || !repo) {
    return { status: 400, body: { ok: false, message: "repoUrl must be a public GitHub URL or owner/repo." } };
  }

  const token = accessToken?.trim() || "";
  if (!token) {
    const access = await resolveGithubRepoAccessToken(owner, repo);
    if (!access.ok) {
      return { status: access.status, body: { ok: false, message: access.message } };
    }
    return openAutofixPullRequest(repoInput, filePath, access.token);
  }

  const repoUrl = `https://github.com/${ownerRepo}`;
  if (!isFirewallSourcePath(filePath)) {
    return {
      status: 400,
      body: { ok: false, message: "filePath must be a TypeScript or JavaScript source file inside the repository." },
    };
  }

  const remote = await readGitHubSourceFile(repoUrl, filePath, token);
  if (!remote.ok) {
    return { status: remote.status, body: { ok: false, message: remote.message } };
  }
  if (remote.content.length > MAX_CONTENT) {
    return { status: 413, body: { ok: false, message: "File is too large to refactor in one pass." } };
  }

  if (isTestSourcePath(filePath) || isTestSuiteSource(remote.content)) {
    return {
      status: 422,
      body: {
        ok: false,
        message:
          "Test files cannot be auto-split into modules. Shared helpers break across files and CI fails typecheck. Close any open split PR for this test and leave the suite as one file.",
      },
    };
  }

  const plan = planAutofix(filePath, remote.content);
  const agentic = isAgenticClientDbEnabled();
  if (!plan.canOpenPullRequest || plan.writes.length === 0) {
    if (agentic) {
      return openArchitectureAgentFallback({
        token,
        owner,
        repo,
        repoUrl,
        filePath,
        content: remote.content,
        summary: plan.summary,
      });
    }
    return {
      status: 422,
      body: {
        ok: false,
        message: plan.summary || "This file has no safe autofix, so no pull request was opened.",
      },
    };
  }

  const title =
    plan.writes.length === 1
      ? `fix: handle errors in ${filePath}`
      : `refactor: split ${filePath} into modules`;
  const writes = plan.writes.map((file) => ({ filePath: file.filePath, content: file.content }));

  if (agentic) {
    const finalized = await finalizeAutofixWrites(writes);
    if (!finalized.ok) {
      return openArchitectureAgentFallback({
        token,
        owner,
        repo,
        repoUrl,
        filePath,
        content: remote.content,
        summary: finalized.message,
      });
    }
    return publishPullRequest({
      token,
      owner,
      repo,
      repoUrl,
      title,
      summary: plan.summary,
      branch: branchName(filePath),
      body: pullRequestBody(filePath, plan.summary, finalized.writes),
      recordFilePath: filePath,
      writes: finalized.writes,
    });
  }

  return publishPullRequest({
    token,
    owner,
    repo,
    repoUrl,
    title,
    summary: plan.summary,
    branch: branchName(filePath),
    body: pullRequestBody(filePath, plan.summary, writes),
    recordFilePath: filePath,
    writes,
  });
}

/**
 * Phase 4 autopilot: plan → optional agentic fallback → tsc gate → PR on
 * `provix/auto-heal-*`. Used by the webhook push/audit path and manual triggers.
 */
export async function openAutopilotPullRequest(
  repoInput: string,
  finding: AutopilotFinding,
  options?: { token?: string; content?: string }
): Promise<PrResult> {
  const ownerRepo = toGitHubOwnerRepo(repoInput);
  const [owner, repo] = ownerRepo?.split("/") ?? [];
  if (!ownerRepo || !owner || !repo) {
    return { status: 400, body: { ok: false, message: "repoUrl must be a public GitHub URL or owner/repo." } };
  }
  const token = options?.token?.trim() || "";
  if (!token) {
    const access = await resolveGithubRepoAccessToken(owner, repo);
    if (!access.ok) {
      return { status: access.status, body: { ok: false, message: access.message } };
    }
    return openAutopilotPullRequest(repoInput, finding, { ...options, token: access.token });
  }

  const repoUrl = `https://github.com/${ownerRepo}`;
  const filePath = finding.filePath.replace(/\\/g, "/");
  let content = options?.content;
  if (content == null) {
    const remote = await readGitHubSourceFile(repoUrl, filePath, token);
    if (!remote.ok) {
      return { status: remote.status, body: { ok: false, message: remote.message } };
    }
    content = remote.content;
  }
  if (content.length > MAX_CONTENT) {
    return { status: 413, body: { ok: false, message: "File is too large to fix in one pass." } };
  }

  const serverActionPath = serverActionFilePath(filePath);
  const existingAction =
    finding.category === "CLIENT_DB_EXPOSURE"
      ? await readGitHubTextFile(repoUrl, serverActionPath, { auth: token })
      : null;
  const existingEnv =
    finding.category === "SECRET_LEAK"
      ? await readGitHubTextFile(repoUrl, ".env.example", { auth: token })
      : null;
  const tsconfigs = await readRepoTsconfigContents(repoUrl, token);

  const fix = await runAutopilotFix({
    finding,
    content,
    existingServerAction: existingAction?.ok ? existingAction.content : null,
    existingEnvExample: existingEnv?.ok ? existingEnv.content : null,
    tsconfigText: tsconfigs[0] ?? null,
  });
  if (!fix.ok) {
    return { status: 422, body: { ok: false, message: fix.message } };
  }

  return publishPullRequest({
    token,
    owner,
    repo,
    repoUrl,
    title: fix.title,
    summary: fix.summary,
    branch: autopilotBranchName(fix.branchSlug, filePath),
    body: [
      buildProvixHealPullRequestHeader(
        autopilotVulnerabilitySentence(finding, fix.summary),
        oneSentence(fix.summary, "Applied a surgical patch for the reported finding.")
      ),
      "",
      `Source: ${fix.source} (${fix.attempts} attempt${fix.attempts === 1 ? "" : "s"})`,
      "",
      "### Files in this pull request",
      ...fix.writes.map((write) => `- \`${write.filePath}\``),
      "",
      "Generated by Provix.",
    ].join("\n"),
    recordFilePath: filePath,
    writes: fix.writes,
  });
}

async function openArchitectureAgentFallback(input: {
  token: string;
  owner: string;
  repo: string;
  repoUrl: string;
  filePath: string;
  content: string;
  summary: string;
}): Promise<PrResult> {
  const agent = await agenticFixWithRetry({
    finding: {
      filePath: input.filePath,
      line: 1,
      category: "ARCHITECTURAL_BLOAT",
      snippet: input.summary,
    },
    content: input.content,
    existingServerAction: null,
    existingEnvExample: null,
  });
  if (!agent.ok) {
    return { status: 422, body: { ok: false, message: MANUAL_REVIEW_MESSAGE } };
  }
  const summary = "Split a component into modules after the deterministic split could not be typechecked.";
  return publishPullRequest({
    token: input.token,
    owner: input.owner,
    repo: input.repo,
    repoUrl: input.repoUrl,
    title: `refactor: split ${input.filePath} into modules`,
    summary,
    branch: branchName(input.filePath),
    body: pullRequestBody(input.filePath, summary, agent.writes),
    recordFilePath: input.filePath,
    writes: agent.writes,
  });
}

type CommitWrite = {
  filePath: string;
  content: string;
};

function securityBranchName(slug: string, filePath: string): string {
  const fileSlug = filePath
    .replace(/\.(tsx|ts|jsx|js|json)$/i, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .toLowerCase();
  return `provix/security-${slug}-${fileSlug || "fix"}-${Date.now().toString(36)}`;
}

function envNameFromSecretWrites(writes: readonly CommitWrite[]): string | undefined {
  for (const write of writes) {
    if (write.filePath.replace(/\\/g, "/").endsWith(".env.example")) {
      const line = write.content.split(/\r?\n/).find((entry) => /^[A-Z][A-Z0-9_]*=/.test(entry));
      if (line) return line.replace(/=.*$/, "");
    }
  }
  for (const write of writes) {
    const match = write.content.match(/process\.env\.([A-Z][A-Z0-9_]*)/);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function securityPullRequestBody(
  summary: string,
  writes: CommitWrite[],
  options?: { category?: SecurityCategory; envName?: string; vulnerability?: string }
): string {
  const files = writes.map((file) => `- \`${file.filePath}\``).join("\n");
  const sections = [
    buildProvixHealPullRequestHeader(
      securityVulnerabilitySentence(options?.category, options?.vulnerability, summary),
      securityFixSentence(options?.category, summary)
    ),
    "",
    "### Files in this pull request",
    files,
    "",
  ];
  if (options?.category === "SECRET_LEAK") {
    sections.push(
      secretLeakPullRequestSection(options.envName ?? envNameFromSecretWrites(writes)),
      ""
    );
  }
  sections.push(
    "Review the diff before merging. Secret values are redacted and are not included in this commit.",
    "",
    "Generated by Provix."
  );
  return sections.join("\n");
}

function normalizeWritePath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!isRepositoryTextPath(normalized)) return null;
  return normalized;
}

const MANUAL_REVIEW_MESSAGE = "This finding stays on manual review. No pull request was opened.";

function agenticFallbackSummary(category: SecurityCategory, filePath: string): { title: string; summary: string; branchSlug: string } {
  if (category === "SECRET_LEAK") {
    return {
      title: `fix: remove hardcoded secret from ${filePath}`,
      summary: secretLeakMessage("Hardcoded secret", "an environment variable"),
      branchSlug: "secret",
    };
  }
  if (category === "VULNERABLE_DEPENDENCY") {
    return {
      title: `fix: update dependency in ${filePath}`,
      summary: "Updated a vulnerable or deprecated dependency.",
      branchSlug: "dependency",
    };
  }
  return {
    title: `fix: move client query in ${filePath} to a server action`,
    summary: "Moved a client Supabase query behind a signed-in server action.",
    branchSlug: "client-query",
  };
}

async function openAgenticClientDbFallback(input: {
  token: string;
  owner: string;
  repo: string;
  repoUrl: string;
  normalizedPath: string;
  line: number;
  category: SecurityCategory;
  content: string;
  snippet?: string | null;
  layout: ReturnType<typeof resolveSecurityFixLayout> | null;
  plan: SecurityFixPlan | null;
  pinnedSha?: string | null;
  verification?: PublishVerification | null;
}): Promise<PrResult> {
  const clientDb = input.category === "CLIENT_DB_EXPOSURE";
  const readOpts = githubReadOptions(input.token, input.pinnedSha);
  const serverActionPath =
    input.layout?.serverActionPath ?? serverActionFilePath(input.normalizedPath);
  const existingAction = clientDb
    ? await readGitHubTextFile(input.repoUrl, serverActionPath, readOpts)
    : null;
  const existingEnv = input.category === "SECRET_LEAK"
    ? await readGitHubTextFile(input.repoUrl, ".env.example", readOpts)
    : null;
  const agent = await agenticFixWithRetry({
    finding: {
      filePath: input.normalizedPath,
      line: input.line,
      category: input.category,
      ...(input.snippet ? { snippet: input.snippet } : {}),
    },
    content: input.content,
    layout: input.layout,
    existingServerAction: existingAction?.ok ? existingAction.content : null,
    existingEnvExample: existingEnv?.ok ? existingEnv.content : null,
  });
  if (!agent.ok) {
    return { status: 422, body: { ok: false, message: MANUAL_REVIEW_MESSAGE } };
  }
  const fallback = agenticFallbackSummary(input.category, input.normalizedPath);
  const summary = input.plan?.summary ?? fallback.summary;
  return publishPullRequest({
    token: input.token,
    owner: input.owner,
    repo: input.repo,
    repoUrl: input.repoUrl,
    title: input.plan?.title ?? fallback.title,
    summary,
    branch: securityBranchName(input.plan?.branchSlug ?? fallback.branchSlug, input.normalizedPath),
    body: securityPullRequestBody(summary, agent.writes, {
      category: input.category,
      vulnerability: input.verification?.target.message,
    }),
    recordFilePath: input.normalizedPath,
    writes: agent.writes,
    pinnedSha: input.pinnedSha,
    verification: input.verification,
  });
}

export async function openSecurityFixPullRequest(
  repoInput: string,
  filePath: string,
  line: number,
  category: SecurityCategory,
  hint?: {
    snippet?: string | null;
    token?: string | null;
    commitSha?: string | null;
    /** Original PVIM finding identity for post-fix re-analysis. */
    pvim?: Omit<PvimPublishVerification, "commitSha"> & { commitSha?: string };
  }
): Promise<PrResult> {
  const ownerRepo = toGitHubOwnerRepo(repoInput);
  const [owner, repo] = ownerRepo?.split("/") ?? [];
  if (!ownerRepo || !owner || !repo) {
    return { status: 400, body: { ok: false, message: "repoUrl must be a public GitHub URL or owner/repo." } };
  }

  const provided = hint?.token?.trim() || "";
  if (!provided) {
    const access = await resolveGithubRepoAccessToken(owner, repo);
    if (!access.ok) {
      return { status: access.status, body: { ok: false, message: access.message } };
    }
    return openSecurityFixPullRequest(repoInput, filePath, line, category, {
      snippet: hint?.snippet,
      token: access.token,
      commitSha: hint?.commitSha,
      ...(hint?.pvim ? { pvim: hint.pvim } : {}),
    });
  }
  const token = provided;

  const rawPin = hint?.commitSha;
  const pinRequested =
    rawPin != null && typeof rawPin === "string" ? rawPin.trim() : rawPin != null ? String(rawPin).trim() : "";
  const pin = pinRequested ? normalizeCommitSha(pinRequested) : null;
  if (pinRequested && !pin) {
    return { status: 400, body: { ok: false, message: "commitSha must be a Git SHA." } };
  }

  const repoUrl = `https://github.com/${ownerRepo}`;
  const normalizedPath = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!isRepositoryTextPath(normalizedPath)) {
    return { status: 400, body: { ok: false, message: "filePath must be a text file inside the repository." } };
  }
  if (!Number.isInteger(line) || line < 1) {
    return { status: 400, body: { ok: false, message: "line must be a positive integer." } };
  }

  const readOpts = githubReadOptions(token, pin);
  const remote = await readGitHubTextFile(repoUrl, normalizedPath, readOpts);
  if (!remote.ok) {
    return { status: remote.status, body: { ok: false, message: remote.message } };
  }
  if (remote.content.length > MAX_CONTENT) {
    return { status: 413, body: { ok: false, message: "File is too large to fix in one pass." } };
  }

  if (isTestSourcePath(normalizedPath) || isTestSuiteSource(remote.content)) {
    return {
      status: 422,
      body: {
        ok: false,
        message:
          "Test files and scanner fixtures are not auto-fixed. Example imports inside tests are not production dependencies.",
      },
    };
  }

  const originalFinding = captureOriginalSecurityFinding(
    { filePath: normalizedPath, content: remote.content },
    category,
    line,
    { snippet: hint?.snippet }
  );
  const pvimIdentity = hint?.pvim;
  const pvimCommitSha = pvimIdentity
    ? normalizeCommitSha(pvimIdentity.commitSha ?? pin) ?? pin
    : null;
  if (pvimIdentity && !pvimCommitSha) {
    return {
      status: 400,
      body: { ok: false, message: "commitSha must be a Git SHA for PVIM post-fix verification." },
    };
  }
  const verification: PublishVerification = {
    target: originalFinding,
    ...(pvimIdentity && pvimCommitSha
      ? {
          pvim: {
            findingId: pvimIdentity.findingId,
            ruleId: pvimIdentity.ruleId,
            filePath: pvimIdentity.filePath,
            commitSha: pvimCommitSha,
            ...(pvimIdentity.analyze ? { analyze: pvimIdentity.analyze } : {}),
            ...(pvimIdentity.clientDeps ? { clientDeps: pvimIdentity.clientDeps } : {}),
          },
        }
      : {}),
  };

  const tsconfigContents =
    category === "CLIENT_DB_EXPOSURE" ? await readRepoTsconfigContents(repoUrl, token, pin) : [];
  const layout =
    category === "CLIENT_DB_EXPOSURE"
      ? resolveSecurityFixLayout({ clientFilePath: normalizedPath, tsconfigContents })
      : null;
  // Relocate via span / query fingerprint when prior patches shifted the static line.
  const plan = planSecurityFix(
    { filePath: normalizedPath, content: remote.content },
    category,
    line,
    layout,
    { snippet: hint?.snippet }
  );
  const agenticFallback = isAgenticClientDbEnabled();
  if (!plan || plan.writes.length === 0) {
    if (agenticFallback) {
      return openAgenticClientDbFallback({
        token,
        owner,
        repo,
        repoUrl,
        normalizedPath,
        line,
        category,
        content: remote.content,
        snippet: hint?.snippet,
        layout,
        plan,
        pinnedSha: pin,
        verification,
      });
    }
    return {
      status: 422,
      body: { ok: false, message: "This finding has no safe security fix, so no pull request was opened." },
    };
  }

  const writes: CommitWrite[] = [];
  const presentPaths = new Set<string>();
  for (const write of plan.writes) {
    const path = normalizeWritePath(write.filePath);
    if (!path) {
      return { status: 400, body: { ok: false, message: "The security fix tried to write outside the repository." } };
    }
    if (write.content.length > MAX_CONTENT) {
      return { status: 413, body: { ok: false, message: "The generated fix is too large to commit." } };
    }
    if (write.appendLine) {
      const existing = await readGitHubTextFile(repoUrl, path, readOpts);
      const current = existing.ok ? existing.content : existing.status === 404 ? null : null;
      if (!existing.ok && existing.status !== 404) {
        return { status: existing.status, body: { ok: false, message: existing.message } };
      }
      writes.push({ filePath: path, content: mergeEnvExample(current, write.appendLine) });
      presentPaths.add(path);
      continue;
    }
    if (isSupportingHelperPath(path)) {
      const existing = await readGitHubTextFile(repoUrl, path, readOpts);
      if (!existing.ok && existing.status !== 404) {
        return { status: existing.status, body: { ok: false, message: existing.message } };
      }
      // Never overwrite an app's existing createClient helper — only scaffold when missing.
      if (existing.ok) {
        presentPaths.add(path);
        continue;
      }
      writes.push({ filePath: path, content: write.content });
      presentPaths.add(path);
      continue;
    }
    if (isServerActionFilePath(path) || (layout && path === layout.serverActionPath)) {
      const existing = await readGitHubTextFile(repoUrl, path, readOpts);
      if (!existing.ok && existing.status !== 404) {
        return { status: existing.status, body: { ok: false, message: existing.message } };
      }
      writes.push({
        filePath: path,
        content: mergeServerAction(existing.ok ? existing.content : null, write.content),
      });
      presentPaths.add(path);
      continue;
    }
    writes.push({ filePath: path, content: write.content });
    presentPaths.add(path);
  }

  // Catch helpers imported by the patch that the plan omitted (or that were skipped above).
  for (const helper of missingSupportingHelperWrites(writes, layout)) {
    const path = normalizeWritePath(helper.filePath);
    if (!path || presentPaths.has(path)) continue;
    const existing = await readGitHubTextFile(repoUrl, path, readOpts);
    if (!existing.ok && existing.status !== 404) {
      return { status: existing.status, body: { ok: false, message: existing.message } };
    }
    if (existing.ok) continue;
    if (helper.content.length > MAX_CONTENT) {
      return { status: 413, body: { ok: false, message: "The generated fix is too large to commit." } };
    }
    writes.push({ filePath: path, content: helper.content });
    presentPaths.add(path);
  }

  const publishInput = {
    token,
    owner,
    repo,
    repoUrl,
    title: plan.title,
    summary: plan.summary,
    branch: securityBranchName(plan.branchSlug, normalizedPath),
    body: securityPullRequestBody(plan.summary, writes, {
      category,
      vulnerability: originalFinding.message,
    }),
    recordFilePath: normalizedPath,
    pinnedSha: pin,
    verification,
  };

  if (agenticFallback) {
    const uncoveredClient =
      category === "CLIENT_DB_EXPOSURE" &&
      !isFixtureCoveredClientQuery({ filePath: normalizedPath, content: remote.content }, line);
    if (uncoveredClient) {
      return openAgenticClientDbFallback({
        token,
        owner,
        repo,
        repoUrl,
        normalizedPath,
        line,
        category,
        content: remote.content,
        snippet: hint?.snippet,
        layout,
        plan,
        pinnedSha: pin,
        verification,
      });
    }
    const finalized = await finalizeAutofixWrites(writes);
    if (!finalized.ok) {
      return openAgenticClientDbFallback({
        token,
        owner,
        repo,
        repoUrl,
        normalizedPath,
        line,
        category,
        content: remote.content,
        snippet: hint?.snippet,
        layout,
        plan,
        pinnedSha: pin,
        verification,
      });
    }
    return publishPullRequest({ ...publishInput, writes: finalized.writes });
  }

  return publishPullRequest({ ...publishInput, writes });
}

async function publishPullRequest(input: {
  token: string;
  owner: string;
  repo: string;
  repoUrl: string;
  title: string;
  summary: string;
  branch: string;
  body: string;
  recordFilePath: string;
  writes: CommitWrite[];
  pinnedSha?: string | null;
  verification?: PublishVerification | null;
}): Promise<PrResult> {
  // 1) Heal / bundle helpers first (no GitHub writes yet).
  const healed = healAutofixWrites(input.writes);
  if (!healed.ok) {
    return {
      status: 422,
      body: {
        ok: false,
        message: healed.message,
      },
    };
  }
  const writes = healed.writes;

  // 2) HARD GATE — temp preflight copies reachable `@/*` modules and ambient-stubs
  // any missing internal import (`declare module "@/…"`) before `tsc --noEmit`.
  let preflightNote;
  try {
    preflightNote = await assertAutofixTscPreflightPasses(writes);
  } catch (error) {
    const message =
      error instanceof AutofixTscPreflightError
        ? error.message
        : error instanceof Error
          ? `Pre-flight \`npx tsc --noEmit\` failed (${error.message}). The pull request was not opened.`
          : "Pre-flight `npx tsc --noEmit` failed. The pull request was not opened.";
    console.error("[autofix/pr] refusing to open pull request after typecheck failure", message);
    return {
      status: 422,
      body: {
        ok: false,
        message,
      },
    };
  }

  // 2b) Security path only — prove the original finding is gone before any GitHub write.
  if (input.verification) {
    const patchedScanFiles = writes.map((file) => ({
      filePath: file.filePath,
      content: file.content,
    }));
    const verified = verifySecurityFixResolved(
      input.verification.target,
      patchedScanFiles,
      { scan: input.verification.scan }
    );
    if (!verified.ok) {
      console.error(
        "[autofix/pr] refusing to open pull request; post-fix verification failed",
        verified.message
      );
      return {
        status: 422,
        body: { ok: false, message: verified.message },
      };
    }

    // 2c) PVIM-originated fixes — re-run PVIM against the same patched write set.
    // Supplements Provix verification; never substitutes for it.
    if (input.verification.pvim) {
      const pvimVerified = await verifyPvimFixResolved(
        {
          findingId: input.verification.pvim.findingId,
          ruleId: input.verification.pvim.ruleId,
          filePath: input.verification.pvim.filePath,
          commitSha: input.verification.pvim.commitSha,
        },
        patchedScanFiles.map((file) => ({
          path: file.filePath,
          content: file.content,
        })),
        {
          analyze: input.verification.pvim.analyze,
          clientDeps: input.verification.pvim.clientDeps,
        }
      );
      if (!pvimVerified.ok) {
        console.error(
          "[autofix/pr] refusing to open pull request; post-fix PVIM verification failed",
          pvimVerified.message
        );
        return {
          status: 422,
          body: { ok: false, message: pvimVerified.message },
        };
      }
    }
  }

  // 3) Only construct the GitHub client after typecheck (and optional verify) have passed.
  // Verification badges live in the standardized header on `input.body` (static copy).
  void preflightNote;
  const octokit = new Octokit({ auth: input.token, userAgent: "provix-architecture-firewall" });
  const pullBody = input.body;
  let createdBranch = false;

  try {
    const repository = await octokit.rest.repos.get({ owner: input.owner, repo: input.repo });
    const base = repository.data.default_branch;
    const ref = await octokit.rest.git.getRef({
      owner: input.owner,
      repo: input.repo,
      ref: `heads/${base}`,
    });
    const headSha = ref.data.object.sha;

    let parentSha = headSha;
    if (input.pinnedSha) {
      const pinnedCommit = await octokit.rest.git.getCommit({
        owner: input.owner,
        repo: input.repo,
        commit_sha: input.pinnedSha,
      });
      parentSha = pinnedCommit.data.sha;
      if (parentSha.toLowerCase() !== headSha.toLowerCase()) {
        console.error(
          "[autofix/pr] refusing to open pull request; pinned commit is not default-branch HEAD",
          { pinned: parentSha, head: headSha, base }
        );
        return {
          status: 409,
          body: {
            ok: false,
            message: pinnedBaseMismatchMessage(base, parentSha, headSha),
          },
        };
      }
    }

    // 3b) HARD GATE — if main already fails CI/typecheck, refuse. Otherwise every
    // Open Fix PR inherits that failure (Provix gate green, GitHub CI red).
    const baseReady = await assertBaseBranchReadyForAutofix(
      octokit,
      input.owner,
      input.repo,
      base,
      parentSha
    );
    if (!baseReady.ok) {
      console.error("[autofix/pr] refusing to open pull request; base branch CI is red", baseReady.message);
      return {
        status: 422,
        body: { ok: false, message: baseReady.message },
      };
    }

    const parent = await octokit.rest.git.getCommit({
      owner: input.owner,
      repo: input.repo,
      commit_sha: parentSha,
    });
    const tree = await octokit.rest.git.createTree({
      owner: input.owner,
      repo: input.repo,
      base_tree: parent.data.tree.sha,
      tree: writes.map((file) => ({
        path: file.filePath,
        mode: "100644" as const,
        type: "blob" as const,
        content: file.content,
      })),
    });
    const commit = await octokit.rest.git.createCommit({
      owner: input.owner,
      repo: input.repo,
      message: `${input.title}\n\n${input.summary}`,
      tree: tree.data.sha,
      parents: [parentSha],
    });
    await octokit.rest.git.createRef({
      owner: input.owner,
      repo: input.repo,
      ref: `refs/heads/${input.branch}`,
      sha: commit.data.sha,
    });
    createdBranch = true;
    const pull = await octokit.rest.pulls.create({
      owner: input.owner,
      repo: input.repo,
      title: input.title,
      head: input.branch,
      base,
      body: pullBody,
    });

    await recordOpenAutofixPullRequest({
      owner: input.owner,
      repo: input.repo,
      filePath: input.recordFilePath,
      number: pull.data.number,
      url: pull.data.html_url,
      branch: input.branch,
      commitMessage: input.title,
    });

    return {
      status: 201,
      body: {
        ok: true,
        message: `Opened pull request #${pull.data.number} on ${input.repoUrl}.`,
        url: pull.data.html_url,
        number: pull.data.number,
        title: pull.data.title,
        branch: input.branch,
        base,
      },
    };
  } catch (error) {
    if (error instanceof AutofixTscPreflightError) {
      return {
        status: 422,
        body: { ok: false, message: error.message },
      };
    }
    let orphanDeleted = false;
    if (createdBranch && input.branch.startsWith("provix/")) {
      try {
        await octokit.rest.git.deleteRef({
          owner: input.owner,
          repo: input.repo,
          ref: `heads/${input.branch}`,
        });
        orphanDeleted = true;
      } catch (deleteError) {
        console.error(
          "[autofix/pr] orphan branch was not deleted",
          input.branch,
          deleteError instanceof Error ? deleteError.message : deleteError
        );
      }
    }
    const status = statusOf(error);
    const message = failureMessage(error);
    if (status === 404) {
      const githubMessage = githubResponseMessage(error);
      console.log(
        `[autofix/pr] GitHub could not find repository or branch. owner=${input.owner} repo=${input.repo} message=${githubMessage}`
      );
    }
    return {
      status: status === 401 ? 401 : status === 403 || status === 404 || status === 422 ? status : 502,
      body: {
        ok: false,
        message:
          createdBranch && !orphanDeleted
            ? `${message} Branch ${input.branch} was created, but the pull request was not opened.`
            : message,
        branch: createdBranch && !orphanDeleted ? input.branch : undefined,
      },
    };
  }
}

