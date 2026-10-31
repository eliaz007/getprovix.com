import { Octokit } from "@octokit/rest";
import type { FirewallAutofixPullRequestResponse } from "@/lib/firewall-contract";
import {
  AutofixTscPreflightError,
  assertAutofixTscPreflightPasses,
} from "@/lib/autofix-tsc-preflight";
import { healAutofixWrites } from "@/lib/autofix-write-validation";
import { planAutofix } from "@/lib/firewall-autofix";
import { recordOpenAutofixPullRequest } from "@/lib/firewall-open-prs";
import { toGitHubOwnerRepo } from "@/lib/github-repo-ref";
import { isFirewallSourcePath, isRepositoryTextPath, readGitHubSourceFile, readGitHubTextFile } from "@/lib/github-source-file";
import {
  isServerActionFilePath,
  isSupportingHelperPath,
  mergeEnvExample,
  mergeServerAction,
  missingSupportingHelperWrites,
  planSecurityFix,
  resolveSecurityFixLayout,
  type SecurityCategory,
} from "@/lib/scanner/security-suite";
import { readRepoTsconfigContents } from "./readrepotsconfigcontents";
import { MAX_CONTENT } from "./max-content";
import type { PrResult } from "./prresult";
import { githubToken } from "./githubtoken";
import type { CommitWrite } from "./commitwrite";
import { securityBranchName } from "./securitybranchname";
import { securityPullRequestBody } from "./securitypullrequestbody";
import { normalizeWritePath } from "./normalizewritepath";
import { publishPullRequest } from "./publishpullrequest";

export async function openSecurityFixPullRequest(
  repoInput: string,
  filePath: string,
  line: number,
  category: SecurityCategory,
  hint?: { snippet?: string | null }
): Promise<PrResult> {
  const token = githubToken();
  if (!token) {
    return {
      status: 401,
      body: {
        ok: false,
        message: "GITHUB_TOKEN is not set. Add a token with permission to push branches and open pull requests.",
      },
    };
  }

  const ownerRepo = toGitHubOwnerRepo(repoInput);
  const [owner, repo] = ownerRepo?.split("/") ?? [];
  if (!ownerRepo || !owner || !repo) {
    return { status: 400, body: { ok: false, message: "repoUrl must be a public GitHub URL or owner/repo." } };
  }
  const repoUrl = `https://github.com/${ownerRepo}`;
  const normalizedPath = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!isRepositoryTextPath(normalizedPath)) {
    return { status: 400, body: { ok: false, message: "filePath must be a text file inside the repository." } };
  }
  if (!Number.isInteger(line) || line < 1) {
    return { status: 400, body: { ok: false, message: "line must be a positive integer." } };
  }

  const remote = await readGitHubTextFile(repoUrl, normalizedPath);
  if (!remote.ok) {
    return { status: remote.status, body: { ok: false, message: remote.message } };
  }
  if (remote.content.length > MAX_CONTENT) {
    return { status: 413, body: { ok: false, message: "File is too large to fix in one pass." } };
  }

  const tsconfigContents = category === "CLIENT_DB_EXPOSURE" ? await readRepoTsconfigContents(repoUrl) : [];
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
  if (!plan || plan.writes.length === 0) {
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
      const existing = await readGitHubTextFile(repoUrl, path);
      const current = existing.ok ? existing.content : existing.status === 404 ? null : null;
      if (!existing.ok && existing.status !== 404) {
        return { status: existing.status, body: { ok: false, message: existing.message } };
      }
      writes.push({ filePath: path, content: mergeEnvExample(current, write.appendLine) });
      presentPaths.add(path);
      continue;
    }
    if (isSupportingHelperPath(path)) {
      const existing = await readGitHubTextFile(repoUrl, path);
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
      const existing = await readGitHubTextFile(repoUrl, path);
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
    const existing = await readGitHubTextFile(repoUrl, path);
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

  return publishPullRequest({
    token,
    owner,
    repo,
    repoUrl,
    title: plan.title,
    summary: plan.summary,
    branch: securityBranchName(plan.branchSlug, normalizedPath),
    body: securityPullRequestBody(plan.summary, writes),
    recordFilePath: normalizedPath,
    writes,
  });
}
