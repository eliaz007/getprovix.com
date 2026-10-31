import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { Octokit } from "@octokit/rest";
import { NextResponse } from "next/server";
import { analyzeSourceTexts, type SourceTextFile } from "../../scripts/ingest-engine";
import { finalizeAutofixWrites } from "@/lib/autofix-write-validation";
import {
  isSecurityCategory,
  violationCategory,
  type FirewallCategory,
  type FirewallRemediation,
  type FirewallViolation,
} from "@/lib/firewall-contract";
import { resolveGithubInstallationTokenForRepo } from "@/lib/github-app-client";
import { isRepositoryTextPath } from "@/lib/github-source-file";
import {
  isServerActionFilePath,
  isSupportingHelperPath,
  mergeEnvExample,
  mergeServerAction,
  missingSupportingHelperWrites,
  pickNextSecurityFindingForBatch,
  planSecurityFix,
  resolveSecurityFixLayout,
  sortFindingsForBatchApply,
} from "@/lib/scanner/security-suite";

export const GATE_CONTEXT = "provix/autonomous-gate";
export const HEAL_COMMIT_PREFIX = "fix: provix autonomous heal";
/** In-memory scan → heal → rescan rounds before a single commit. */
export const HEAL_MAX_ROUNDS = 3;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const IGNORED_SEGMENTS = new Set(["node_modules", ".next", "dist", "build"]);
const LOCKFILES = new Set(["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml"]);
const FILE_CAP = 80;
const MAX_FILE_BYTES = 1_500_000;
const COMMENT_CAP = 12;

export type GateStatusState = "success" | "failure";

export type GateStatusPayload = {
  state: GateStatusState;
  context: typeof GATE_CONTEXT;
  description: string;
  target_url: string;
};

export type GateFinding = {
  filePath: string;
  line: number;
  rule: string;
  kind: "leak" | "violation";
  category: FirewallCategory;
  /** Human-readable why this finding failed the gate. */
  message: string;
  /** Short actionable fix for the PR comment. */
  fix: string;
};

export type HealCommitFile = {
  path: string;
  content: string;
};

export type AutonomousHeal = {
  message: string;
  files: HealCommitFile[];
  notes: string[];
};

export type GatePullFile = {
  filename: string;
  status: string;
  sha: string;
  patch?: string | null;
};

export type GithubGateClient = {
  listPullFiles(input: { owner: string; repo: string; number: number }): Promise<GatePullFile[]>;
  readFile(input: { owner: string; repo: string; sha: string }): Promise<string | null>;
  postStatus(input: { owner: string; repo: string; sha: string; payload: GateStatusPayload }): Promise<void>;
  postComment(input: { owner: string; repo: string; number: number; body: string }): Promise<void>;
  commitToBranch?(input: {
    owner: string;
    repo: string;
    branch: string;
    parentSha: string;
    message: string;
    files: HealCommitFile[];
  }): Promise<{ sha: string }>;
  commitMessage?(input: { owner: string; repo: string; sha: string }): Promise<string>;
  branchHead?(input: { owner: string; repo: string; branch: string }): Promise<{ sha: string; message: string }>;
  readTextFile?(input: { owner: string; repo: string; path: string; ref: string }): Promise<string | null>;
};

type PullRequestDelivery = {
  owner: string;
  repo: string;
  number: number;
  sha: string;
  branch: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function signGithubBody(body: Buffer, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifyGithubSignature(body: Buffer, header: string | null, secret: string): boolean {
  if (!secret || !header) return false;
  const provided = header.trim().toLowerCase();
  const expected = signGithubBody(body, secret);
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function gateDescription(leaks: number, violations: number): string {
  const leakLabel = `${leaks} ${leaks === 1 ? "leak" : "leaks"}`;
  const violationLabel = `${violations} ${violations === 1 ? "violation" : "violations"}`;
  const summary = `${leakLabel}, ${violationLabel}`;
  if (leaks === 0 && violations === 0) return `${summary}. Ready to merge.`;
  return `${summary}. See PR comment.`;
}

/** Short fix guidance for a gate finding (category / rule / remediation). */
export function gateFixForFinding(input: {
  category: FirewallCategory;
  rule: string;
  remediation?: FirewallRemediation;
}): string {
  if (input.remediation?.command?.trim()) return input.remediation.command.trim();
  if (input.remediation?.envExample?.trim()) {
    const name = input.remediation.envExample.replace(/=$/, "").trim();
    return `Move the secret into an environment variable${name ? ` (${name})` : ""} and remove it from source.`;
  }
  switch (input.category) {
    case "SECRET_LEAK":
      return "Move the secret into an environment variable and remove it from source.";
    case "CLIENT_DB_EXPOSURE":
      return "Move the query into a server action that checks supabase.auth.getUser().";
    case "VULNERABLE_DEPENDENCY":
      return "Upgrade or replace the vulnerable / deprecated dependency.";
    default:
      break;
  }
  if (input.rule === "Circular Dependency") return "Break the circular import between these modules.";
  if (input.rule === "Architectural Bloat") return "Split the file or reduce its responsibilities.";
  if (input.rule === "Dead Weight / Orphaned Code") {
    return "Delete the unused module or import it from a real entrypoint.";
  }
  if (input.rule === "Boundary Violation") {
    return "Keep admin clients, service-role keys, and raw SQL on the server.";
  }
  return "Open the Heal queue for the suggested patch.";
}

export function buildGateStatus(leaks: number, violations: number, targetUrl: string): GateStatusPayload {
  const failed = leaks > 0 || violations > 0;
  return {
    state: failed ? "failure" : "success",
    context: GATE_CONTEXT,
    description: gateDescription(leaks, violations).slice(0, 140),
    target_url: targetUrl,
  };
}

export function healQueueUrl(owner: string, repo: string, leaks: number, violations: number): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim().replace(/\/$/, "");
  const base = configured || (vercel ? `https://${vercel}` : "http://localhost:3000");
  const params = new URLSearchParams({ repo: `${owner}/${repo}` });
  if (leaks > 0 && violations === 0) params.set("view", "leaks");
  else if (violations > 0) params.set("view", "violations");
  return `${base}/firewall?${params.toString()}`;
}

export function gateComment(input: {
  leaks: number;
  violations: number;
  findings: GateFinding[];
  healUrl: string;
}): string {
  const shown = input.findings.slice(0, COMMENT_CAP);
  const hidden = input.findings.length - shown.length;
  const blocks = shown.map((finding, index) => {
    const why = finding.message.trim() || finding.rule;
    const fix = finding.fix.trim() || gateFixForFinding(finding);
    return [
      `**${index + 1}. \`${finding.filePath}:${finding.line}\`** — ${why}`,
      `Fix: ${fix}`,
    ].join("\n");
  });
  if (hidden > 0) blocks.push(`_…and ${hidden} more in the Heal queue._`);

  return [
    "### Provix Architecture Firewall",
    `**${gateDescription(input.leaks, input.violations)}**`,
    "",
    ...blocks.flatMap((block, index) => (index === 0 ? [block] : ["", block])),
    "",
    `[Open Heal queue](${input.healUrl})`,
  ].join("\n");
}

export function healCommitMessage(parentSha: string, notes: readonly string[]): string {
  return [`${HEAL_COMMIT_PREFIX} ${parentSha}`, "", ...notes].join("\n");
}

export function isAutonomousHealCommit(message: string, parentSha?: string): boolean {
  if (parentSha) return message.startsWith(`${HEAL_COMMIT_PREFIX} ${parentSha}`);
  return message.startsWith(HEAL_COMMIT_PREFIX);
}

export function healComment(input: {
  branch: string;
  notes: readonly string[];
  residual?: {
    leaks: number;
    violations: number;
    findings: GateFinding[];
    healUrl: string;
  };
}): string {
  const header = [
    "```",
    "provix/autonomous-heal",
    `committed to ${input.branch}`,
    ...input.notes,
    "```",
    "",
  ];
  const residual = input.residual;
  if (residual && (residual.leaks > 0 || residual.violations > 0 || residual.findings.length > 0)) {
    return [
      ...header,
      "Partial heal: some findings remain after autonomous rounds.",
      "",
      gateComment(residual),
    ].join("\n");
  }
  return [...header, "Validation passed. The patch is on the pull request branch."].join("\n");
}

export type HealRoundsResult = {
  files: HealCommitFile[];
  notes: string[];
  findings: GateFinding[];
  leaks: number;
  violations: number;
  improved: boolean;
  rounds: number;
};

/**
 * Apply prepareAutonomousHeal up to `maxRounds` times in memory, re-scanning after each
 * round, then return one merged write set for a single commit.
 */
export async function runAutonomousHealRounds(input: {
  files: ReadonlyArray<{ filePath: string; content: string; patch?: string | null }>;
  findings: readonly GateFinding[];
  tsconfigText?: string | null;
  readText?: (filePath: string) => Promise<string | null>;
  maxRounds?: number;
}): Promise<HealRoundsResult | null> {
  const maxRounds = input.maxRounds ?? HEAL_MAX_ROUNDS;
  const working = new Map<string, { filePath: string; content: string; patch?: string | null }>();
  const originalPaths = new Set<string>();
  for (const file of input.files) {
    const filePath = normalizedPath(file.filePath);
    originalPaths.add(filePath);
    working.set(filePath, { filePath, content: file.content, patch: file.patch });
  }

  let findings = input.findings.slice();
  let leaks = findings.filter((finding) => finding.kind === "leak").length;
  let violations = findings.filter((finding) => finding.kind === "violation").length;
  const allNotes: string[] = [];
  const writeMap = new Map<string, string>();
  let rounds = 0;
  let improved = false;

  for (let round = 1; round <= maxRounds; round += 1) {
    if (findings.length === 0) break;
    const beforeCount = findings.length;
    const snapshot = [...working.values()];
    let heal: AutonomousHeal | null = null;
    try {
      heal = await prepareAutonomousHeal({
        files: snapshot,
        findings,
        tsconfigText: input.tsconfigText,
        readText: input.readText,
      });
    } catch (error) {
      console.error(
        "[webhooks/github] heal round failed",
        round,
        error instanceof Error ? error.message : error
      );
      break;
    }
    if (!heal || heal.files.length === 0) break;

    rounds = round;
    improved = true;
    allNotes.push(`round ${round}`);
    for (const note of heal.notes) allNotes.push(note);
    for (const file of heal.files) {
      const filePath = normalizedPath(file.path);
      writeMap.set(filePath, file.content);
      const previous = working.get(filePath);
      // New files (e.g. secure-query.ts): full-file scan. Existing PR files: keep the
      // original patch filter so residuals stay scoped to the pull request diff.
      const patch = originalPaths.has(filePath) ? previous?.patch ?? null : null;
      working.set(filePath, { filePath, content: file.content, patch });
    }

    const scan = scanChangedFiles([...working.values()]);
    findings = scan.findings;
    leaks = scan.leaks;
    violations = scan.violations;
    if (findings.length === 0) break;
    if (findings.length >= beforeCount) break;
  }

  if (!improved || writeMap.size === 0) return null;
  return {
    files: [...writeMap.entries()].map(([path, content]) => ({ path, content })),
    notes: allNotes,
    findings,
    leaks,
    violations,
    improved,
    rounds,
  };
}

/** Build a validated patch for fixable client-boundary leaks and security findings. */
export async function prepareAutonomousHeal(input: {
  files: ReadonlyArray<{ filePath: string; content: string }>;
  findings: readonly GateFinding[];
  tsconfigText?: string | null;
  readText?: (filePath: string) => Promise<string | null>;
}): Promise<AutonomousHeal | null> {
  const contents = new Map<string, string>();
  for (const file of input.files) contents.set(normalizedPath(file.filePath), file.content);
  const extras = new Map<string, string>();
  const notes: string[] = [];
  // Global batch order: category → file → descending line (447 before 419).
  const seeds = sortFindingsForBatchApply(
    input.findings.filter((finding) => isSecurityCategory(finding.category))
  );

  const started = new Set<string>();
  for (const seed of seeds) {
    const filePath = normalizedPath(seed.filePath);
    if (started.has(filePath) || !contents.has(filePath)) continue;
    started.add(filePath);
    for (let pass = 0; pass < 5; pass += 1) {
      const content = contents.get(filePath);
      if (content == null) break;
      // Re-scan and always take the highest remaining line so prior edits cannot
      // invalidate coordinates still scheduled higher in the file.
      const live = pickNextSecurityFindingForBatch({ filePath, content });
      if (!live || !isSecurityCategory(live.category)) break;
      const layout =
        live.category === "CLIENT_DB_EXPOSURE"
          ? resolveSecurityFixLayout({ clientFilePath: filePath, tsconfigContents: [input.tsconfigText] })
          : null;
      const plan = planSecurityFix({ filePath, content }, live.category, live.line, layout);
      if (!plan || plan.writes.length === 0) break;
      let changed = false;
      for (const write of plan.writes) {
        const path = normalizedPath(write.filePath);
        if (!isRepositoryTextPath(path)) return null;
        let next = write.content;
        if (write.appendLine) {
          const existing = extras.get(path) ?? contents.get(path) ?? (await input.readText?.(path)) ?? null;
          next = mergeEnvExample(existing, write.appendLine);
        } else if (isSupportingHelperPath(path) && path !== filePath) {
          const existing = extras.get(path) ?? contents.get(path) ?? (await input.readText?.(path)) ?? null;
          // Keep an existing createClient helper; only scaffold when the repo has none.
          if (existing != null) continue;
          next = write.content;
        } else if (isServerActionFilePath(path) && path !== filePath) {
          const existing = extras.get(path) ?? contents.get(path) ?? (await input.readText?.(path)) ?? null;
          next = mergeServerAction(existing, write.content);
        }
        if (path === filePath) {
          if (next !== content) changed = true;
          contents.set(path, next);
        } else if (extras.get(path) !== next) {
          changed = true;
          extras.set(path, next);
        }
      }
      notes.push(`${filePath}:${live.line}  ${live.category}  ${plan.title}`);
      if (!changed) break;
    }
  }

  if (notes.length === 0) return null;
  const writes: Array<{ filePath: string; content: string }> = [];
  for (const [filePath, content] of contents) {
    const original = input.files.find((file) => normalizedPath(file.filePath) === filePath)?.content;
    if (original !== undefined && original === content) continue;
    writes.push({ filePath, content });
  }
  for (const [filePath, content] of extras) writes.push({ filePath, content });

  // Bundle any scaffoldable helpers the patch imports that still are not in the payload.
  const layout = resolveSecurityFixLayout({
    clientFilePath: writes[0]?.filePath ?? "src/app/actions/secure-query.ts",
    tsconfigContents: [input.tsconfigText],
  });
  for (const helper of missingSupportingHelperWrites(writes, layout)) {
    const path = normalizedPath(helper.filePath);
    if (!isRepositoryTextPath(path)) return null;
    if (writes.some((write) => normalizedPath(write.filePath) === path)) continue;
    const existing = contents.get(path) ?? extras.get(path) ?? (await input.readText?.(path)) ?? null;
    if (existing != null) continue;
    writes.push({ filePath: path, content: helper.content });
    extras.set(path, helper.content);
  }

  if (writes.length === 0) return null;

  // After helper bundling: heal, then `npx tsc --noEmit`. Failure reverts and aborts the commit.
  const healed = await finalizeAutofixWrites(writes);
  if (!healed.ok) {
    console.error("[webhooks/github] autonomous heal failed validation", healed.message);
    return null;
  }
  return {
    message: notes.join("\n"),
    files: healed.writes.map((write) => ({ path: write.filePath, content: write.content })),
    notes,
  };
}

/** Line numbers in the new file that the unified diff adds or replaces. `null` means the patch was omitted. */
export function changedLinesFromPatch(patch: string | null | undefined): Set<number> | null {
  if (patch == null) return null;
  const lines = new Set<number>();
  let next = 0;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk?.[1]) {
      next = Number(hunk[1]);
      continue;
    }
    if (line.startsWith("\\") || line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      lines.add(next);
      next += 1;
      continue;
    }
    if (line.startsWith("-")) continue;
    if (next > 0) next += 1;
  }
  return lines;
}

function normalizedPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function isIgnored(filePath: string): boolean {
  return normalizedPath(filePath)
    .split("/")
    .some((part) => IGNORED_SEGMENTS.has(part) || part === "..");
}

function isSourceFile(filePath: string): boolean {
  if (isIgnored(filePath)) return false;
  return SOURCE_EXTENSIONS.has(path.posix.extname(normalizedPath(filePath)));
}

function isCompanionFile(filePath: string): boolean {
  if (isIgnored(filePath) || isSourceFile(filePath)) return false;
  const name = normalizedPath(filePath).split("/").pop() ?? filePath;
  if (LOCKFILES.has(name)) return false;
  if (name === "package.json" || name === ".env" || name.startsWith(".env.")) return true;
  return name.endsWith(".json");
}

function findingKind(violation: FirewallViolation): GateFinding["kind"] {
  return isSecurityCategory(violation.category) || violationCategory(violation) !== "ARCHITECTURE" ? "leak" : "violation";
}

export function scanChangedFiles(
  files: Array<{ filePath: string; content: string; patch?: string | null }>
): { leaks: number; violations: number; findings: GateFinding[] } {
  const sources: SourceTextFile[] = [];
  const companions: SourceTextFile[] = [];
  const changed = new Map<string, Set<number> | null>();

  for (const file of files) {
    const filePath = normalizedPath(file.filePath);
    if (!filePath || file.content.includes("\u0000")) continue;
    changed.set(filePath, changedLinesFromPatch(file.patch));
    const entry = { filePath, content: file.content };
    if (isSourceFile(filePath)) sources.push(entry);
    else if (isCompanionFile(filePath)) companions.push(entry);
  }

  if (sources.length === 0 && companions.length === 0) {
    return { leaks: 0, violations: 0, findings: [] };
  }

  const report = analyzeSourceTexts(sources, { includeOrphans: false, companionFiles: companions });
  const findings: GateFinding[] = [];
  for (const violation of report.violations) {
    const filePath = normalizedPath(violation.filePath);
    const lines = changed.get(filePath);
    if (lines && violation.line > 0 && !lines.has(violation.line)) continue;
    const category = violationCategory(violation);
    findings.push({
      filePath,
      line: violation.line,
      rule: violation.rule,
      kind: findingKind(violation),
      category,
      message: violation.message.trim() || violation.rule,
      fix: gateFixForFinding({
        category,
        rule: violation.rule,
        remediation: violation.remediation,
      }),
    });
  }

  const leaks = findings.filter((finding) => finding.kind === "leak").length;
  return { leaks, violations: findings.length - leaks, findings };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseDelivery(eventName: string | null, payload: unknown): PullRequestDelivery | "ignore" | "invalid" {
  if (eventName === "ping") return "ignore";
  if (eventName !== "pull_request") return "ignore";
  if (!payload || typeof payload !== "object") return "invalid";
  const body = payload as {
    action?: unknown;
    repository?: { name?: unknown; owner?: { login?: unknown } };
    pull_request?: { number?: unknown; head?: { sha?: unknown; ref?: unknown } };
  };
  const action = readString(body.action);
  if (action !== "opened" && action !== "synchronize") return "ignore";
  const owner = readString(body.repository?.owner?.login);
  const repo = readString(body.repository?.name);
  const sha = readString(body.pull_request?.head?.sha);
  const branch = readString(body.pull_request?.head?.ref);
  const number = body.pull_request?.number;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return "invalid";
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) return "invalid";
  if (!isPullRequestBranch(branch)) return "invalid";
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) return "invalid";
  return { owner, repo, number, sha, branch };
}

function isPullRequestBranch(branch: string): boolean {
  return (
    branch.length > 0 &&
    branch.length <= 200 &&
    /^[A-Za-z0-9._/-]+$/.test(branch) &&
    !branch.includes("..") &&
    !branch.startsWith("/") &&
    !branch.endsWith("/")
  );
}

function decodeBlob(content: string, encoding: string): string | null {
  const text = encoding === "base64" ? Buffer.from(content.replace(/\s/g, ""), "base64").toString("utf8") : content;
  if (text.includes("\u0000") || Buffer.byteLength(text) > MAX_FILE_BYTES) return null;
  return text;
}

export async function createGithubGateClient(owner: string, repo: string): Promise<GithubGateClient> {
  const appConfigured = Boolean(
    process.env.GITHUB_APP_ID?.trim() && process.env.GITHUB_APP_PRIVATE_KEY?.trim()
  );
  const appToken = await resolveGithubInstallationTokenForRepo(owner, repo);
  // Do not fall back to a user PAT when App creds are present but broken — PATs often
  // lack statuses/comment write and produce a confusing 502 after a successful scan.
  if (appConfigured && !appToken) {
    throw new Error(
      "GitHub App credentials are set but could not mint an installation token. Check GITHUB_APP_PRIVATE_KEY on the host (no wrapping quotes)."
    );
  }
  const token = appToken ?? process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "GitHub App installation token unavailable and GITHUB_TOKEN is not set."
    );
  }
  const octokit = new Octokit({ auth: token, userAgent: "provix-architecture-firewall" });
  return {
    async listPullFiles(input) {
      const files: GatePullFile[] = [];
      for (let page = 1; page <= 3; page += 1) {
        const response = await octokit.rest.pulls.listFiles({
          owner: input.owner,
          repo: input.repo,
          pull_number: input.number,
          per_page: 100,
          page,
        });
        for (const file of response.data) {
          if (!file.sha) continue;
          files.push({
            filename: file.filename,
            status: file.status,
            sha: file.sha,
            patch: file.patch,
          });
        }
        if (response.data.length < 100) break;
      }
      return files;
    },
    async readFile(input) {
      const blob = await octokit.rest.git.getBlob({
        owner: input.owner,
        repo: input.repo,
        file_sha: input.sha,
      });
      return decodeBlob(blob.data.content, blob.data.encoding);
    },
    async postStatus(input) {
      await octokit.rest.repos.createCommitStatus({
        owner: input.owner,
        repo: input.repo,
        sha: input.sha,
        state: input.payload.state,
        context: input.payload.context,
        description: input.payload.description,
        target_url: input.payload.target_url,
      });
    },
    async postComment(input) {
      await octokit.rest.issues.createComment({
        owner: input.owner,
        repo: input.repo,
        issue_number: input.number,
        body: input.body,
      });
    },
    async commitMessage(input) {
      const commit = await octokit.rest.git.getCommit({
        owner: input.owner,
        repo: input.repo,
        commit_sha: input.sha,
      });
      return commit.data.message;
    },
    async branchHead(input) {
      const ref = await octokit.rest.git.getRef({
        owner: input.owner,
        repo: input.repo,
        ref: `heads/${input.branch}`,
      });
      const commit = await octokit.rest.git.getCommit({
        owner: input.owner,
        repo: input.repo,
        commit_sha: ref.data.object.sha,
      });
      return { sha: ref.data.object.sha, message: commit.data.message };
    },
    async readTextFile(input) {
      try {
        const response = await octokit.rest.repos.getContent({
          owner: input.owner,
          repo: input.repo,
          path: input.path,
          ref: input.ref,
        });
        if (Array.isArray(response.data) || response.data.type !== "file" || !("content" in response.data)) return null;
        return decodeBlob(response.data.content, response.data.encoding ?? "base64");
      } catch (error) {
        if (statusOf(error) === 404) return null;
        throw error;
      }
    },
    async commitToBranch(input) {
      const parent = await octokit.rest.git.getCommit({
        owner: input.owner,
        repo: input.repo,
        commit_sha: input.parentSha,
      });
      const tree = await octokit.rest.git.createTree({
        owner: input.owner,
        repo: input.repo,
        base_tree: parent.data.tree.sha,
        tree: input.files.map((file) => ({
          path: file.path,
          mode: "100644" as const,
          type: "blob" as const,
          content: file.content,
        })),
      });
      const commit = await octokit.rest.git.createCommit({
        owner: input.owner,
        repo: input.repo,
        message: input.message,
        tree: tree.data.sha,
        parents: [input.parentSha],
      });
      await octokit.rest.git.updateRef({
        owner: input.owner,
        repo: input.repo,
        ref: `heads/${input.branch}`,
        sha: commit.data.sha,
      });
      return { sha: commit.data.sha };
    },
  };
}

function statusOf(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
}

export async function handleGithubWebhook(request: Request, client?: GithubGateClient): Promise<Response> {
  const body = Buffer.from(await request.arrayBuffer());
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) {
    return json({ ok: false, message: "GITHUB_WEBHOOK_SECRET is not set." }, 500);
  }
  if (!verifyGithubSignature(body, request.headers.get("x-hub-signature-256"), secret)) {
    return json({ ok: false, message: "Invalid webhook signature." }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf8")) as unknown;
  } catch {
    return json({ ok: false, message: "Webhook body is not JSON." }, 400);
  }

  const delivery = parseDelivery(request.headers.get("x-github-event"), payload);
  if (delivery === "ignore") return json({ ok: true, ignored: true });
  if (delivery === "invalid") return json({ ok: false, message: "Pull request payload is missing owner, repo, number, or sha." }, 400);

  const appConfigured = Boolean(
    process.env.GITHUB_APP_ID?.trim() && process.env.GITHUB_APP_PRIVATE_KEY?.trim()
  );
  let gate: GithubGateClient;
  try {
    gate = client ?? (await createGithubGateClient(delivery.owner, delivery.repo));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "GitHub App installation token unavailable and GITHUB_TOKEN is not set.";
    return json({ ok: false, message }, 500);
  }
  // createGithubGateClient refuses PAT fallback when App creds are set, so this is accurate.
  const authSource = client ? "injected" : appConfigured ? "github_app" : "github_token_fallback";

  let files: GatePullFile[];
  try {
    files = await gate.listPullFiles(delivery);
  } catch (error) {
    console.error("[webhooks/github] could not list pull request files", error instanceof Error ? error.message : error);
    return json({ ok: false, message: "GitHub did not return the pull request diff." }, 502);
  }

  const selected = files
    .filter((file) => file.status !== "removed" && (isSourceFile(file.filename) || isCompanionFile(file.filename)))
    .slice(0, FILE_CAP);
  const readable: Array<{ filePath: string; content: string; patch?: string | null }> = [];
  try {
    for (const file of selected) {
      const content = await gate.readFile({ owner: delivery.owner, repo: delivery.repo, sha: file.sha });
      if (content === null) continue;
      readable.push({ filePath: file.filename, content, patch: file.patch });
    }
  } catch (error) {
    console.error("[webhooks/github] could not read a changed file", error instanceof Error ? error.message : error);
    return json({ ok: false, message: "GitHub did not return a changed file." }, 502);
  }

  const scan = scanChangedFiles(readable);
  const committed = await commitAutonomousHeal(gate, delivery, readable, scan.findings);
  // Status on this delivery sha reflects the tree GitHub sent. Residual after in-memory
  // rounds is reported on the heal comment; the follow-up synchronize posts the head status.
  const reportFindings = committed?.residual ?? scan;
  const healUrl = healQueueUrl(
    delivery.owner,
    delivery.repo,
    reportFindings.leaks,
    reportFindings.violations
  );
  const payloadStatus = buildGateStatus(scan.leaks, scan.violations, healUrl);
  let statusPosted = false;
  let statusError: string | null = null;
  try {
    await gate.postStatus({
      owner: delivery.owner,
      repo: delivery.repo,
      sha: delivery.sha,
      payload: payloadStatus,
    });
    statusPosted = true;
  } catch (error) {
    // Missing "Commit statuses" App permission still returns 403; keep the gate alive via PR comment.
    statusError = error instanceof Error ? error.message : "status publish failed";
    console.error("[webhooks/github] could not publish the status check", statusError);
  }

  let commentError: string | null = null;
  try {
    if (committed) {
      const residualLeftover =
        committed.residual.leaks > 0 ||
        committed.residual.violations > 0 ||
        committed.residual.findings.length > 0;
      await gate.postComment({
        owner: delivery.owner,
        repo: delivery.repo,
        number: delivery.number,
        body: healComment({
          branch: delivery.branch,
          notes: committed.notes,
          residual: residualLeftover
            ? {
                leaks: committed.residual.leaks,
                violations: committed.residual.violations,
                findings: committed.residual.findings,
                healUrl,
              }
            : undefined,
        }),
      });
    } else if (payloadStatus.state === "failure" || !statusPosted) {
      const fallback =
        statusPosted
          ? gateComment({ ...scan, healUrl })
          : `${gateComment({ ...scan, healUrl })}\n\n_Provix could not publish \`${GATE_CONTEXT}\` — grant the GitHub App **Commit statuses: Read and write** permission, then re-run._`;
      await gate.postComment({
        owner: delivery.owner,
        repo: delivery.repo,
        number: delivery.number,
        body: fallback,
      });
    }
  } catch (error) {
    commentError = error instanceof Error ? error.message : "comment publish failed";
    console.error("[webhooks/github] could not comment on the pull request", commentError);
    if (!statusPosted) {
      const keyRaw = process.env.GITHUB_APP_PRIVATE_KEY?.trim() ?? "";
      return json(
        {
          ok: false,
          message: "GitHub did not accept the status check or PR comment.",
          authSource,
          statusError,
          commentError,
          // Safe diagnostics only — never echo the key.
          appIdSet: Boolean(process.env.GITHUB_APP_ID?.trim()),
          privateKeySet: Boolean(keyRaw),
          privateKeyStartsWithQuote: keyRaw.startsWith('"') || keyRaw.startsWith("'"),
          privateKeyLooksLikePem: keyRaw.includes("BEGIN"),
        },
        502
      );
    }
  }

  return json({
    ok: true,
    state: payloadStatus.state,
    leaks: scan.leaks,
    violations: scan.violations,
    residualLeaks: committed?.residual.leaks ?? scan.leaks,
    residualViolations: committed?.residual.violations ?? scan.violations,
    healRounds: committed?.rounds ?? 0,
    context: payloadStatus.context,
    description: payloadStatus.description,
    healed: Boolean(committed),
    commitSha: committed?.sha,
    statusPosted,
  });
}

async function commitAutonomousHeal(
  gate: GithubGateClient,
  delivery: PullRequestDelivery,
  readable: Array<{ filePath: string; content: string; patch?: string | null }>,
  findings: readonly GateFinding[]
): Promise<{
  sha: string;
  notes: string[];
  rounds: number;
  residual: { leaks: number; violations: number; findings: GateFinding[] };
} | null> {
  if (!gate.commitToBranch) return null;
  try {
    if (gate.commitMessage) {
      const message = await gate.commitMessage({ owner: delivery.owner, repo: delivery.repo, sha: delivery.sha });
      if (isAutonomousHealCommit(message)) return null;
    }
    if (gate.branchHead) {
      const head = await gate.branchHead({ owner: delivery.owner, repo: delivery.repo, branch: delivery.branch });
      if (head.sha !== delivery.sha && isAutonomousHealCommit(head.message, delivery.sha)) return null;
    }
  } catch (error) {
    console.error("[webhooks/github] could not read the pull request head", error instanceof Error ? error.message : error);
  }

  let tsconfigText =
    readable.find((file) => file.filePath === "tsconfig.json" || file.filePath.endsWith("/tsconfig.json"))?.content ?? null;
  const readText = async (filePath: string) => {
    if (!gate.readTextFile) return null;
    return gate.readTextFile({ owner: delivery.owner, repo: delivery.repo, path: filePath, ref: delivery.sha });
  };
  if (!tsconfigText && gate.readTextFile) {
    try {
      tsconfigText = await readText("tsconfig.json");
    } catch (error) {
      console.error("[webhooks/github] could not read tsconfig.json", error instanceof Error ? error.message : error);
      tsconfigText = null;
    }
  }

  let roundsResult: HealRoundsResult | null = null;
  try {
    roundsResult = await runAutonomousHealRounds({
      files: readable,
      findings,
      tsconfigText,
      readText,
    });
  } catch (error) {
    console.error("[webhooks/github] autonomous heal did not finish", error instanceof Error ? error.message : error);
    return null;
  }
  if (!roundsResult) return null;

  try {
    const commit = await gate.commitToBranch({
      owner: delivery.owner,
      repo: delivery.repo,
      branch: delivery.branch,
      parentSha: delivery.sha,
      message: healCommitMessage(delivery.sha, roundsResult.notes),
      files: roundsResult.files,
    });
    return {
      sha: commit.sha,
      notes: roundsResult.notes,
      rounds: roundsResult.rounds,
      residual: {
        leaks: roundsResult.leaks,
        violations: roundsResult.violations,
        findings: roundsResult.findings,
      },
    };
  } catch (error) {
    console.error("[webhooks/github] could not commit the autonomous heal", error instanceof Error ? error.message : error);
    return null;
  }
}

