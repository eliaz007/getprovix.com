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
import { MAX_CONTENT } from "./max-content";
import type { PrResult } from "./prresult";
import { githubToken } from "./githubtoken";
import { branchName } from "./branchname";
import { pullRequestBody } from "./pullrequestbody";
import { publishPullRequest } from "./publishpullrequest";

export async function openAutofixPullRequest(repoInput: string, filePath: string): Promise<PrResult> {
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
  if (!isFirewallSourcePath(filePath)) {
    return {
      status: 400,
      body: { ok: false, message: "filePath must be a TypeScript or JavaScript source file inside the repository." },
    };
  }

  const remote = await readGitHubSourceFile(repoUrl, filePath);
  if (!remote.ok) {
    return { status: remote.status, body: { ok: false, message: remote.message } };
  }
  if (remote.content.length > MAX_CONTENT) {
    return { status: 413, body: { ok: false, message: "File is too large to refactor in one pass." } };
  }

  const plan = planAutofix(filePath, remote.content);
  if (!plan.canOpenPullRequest || plan.writes.length === 0) {
    return {
      status: 422,
      body: { ok: false, message: "This file has no safe autofix, so no pull request was opened." },
    };
  }

  const title =
    plan.writes.length === 1
      ? `fix: handle errors in ${filePath}`
      : `refactor: split ${filePath} into modules`;

  return publishPullRequest({
    token,
    owner,
    repo,
    repoUrl,
    title,
    summary: plan.summary,
    branch: branchName(filePath),
    body: pullRequestBody(filePath, plan.summary, plan.writes),
    recordFilePath: filePath,
    writes: plan.writes.map((file: (typeof writes)[number]) => ({ filePath: file.filePath, content: file.content })),
  });
}
