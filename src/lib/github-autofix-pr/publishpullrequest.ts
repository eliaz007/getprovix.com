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
import type { PrResult } from "./prresult";
import { statusOf } from "./statusof";
import { githubResponseMessage } from "./githubresponsemessage";
import { failureMessage } from "./failuremessage";
import type { CommitWrite } from "./commitwrite";

export async function publishPullRequest(input: {
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
  try {
    await assertAutofixTscPreflightPasses(writes);
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

  // 3) Only construct the GitHub client after typecheck has passed.
  const octokit = new Octokit({ auth: input.token, userAgent: "provix-architecture-firewall" });
  let createdBranch = false;

  try {
    const repository = await octokit.rest.repos.get({ owner: input.owner, repo: input.repo });
    const base = repository.data.default_branch;
    const ref = await octokit.rest.git.getRef({
      owner: input.owner,
      repo: input.repo,
      ref: `heads/${base}`,
    });
    const parent = await octokit.rest.git.getCommit({
      owner: input.owner,
      repo: input.repo,
      commit_sha: ref.data.object.sha,
    });
    const tree = await octokit.rest.git.createTree({
      owner: input.owner,
      repo: input.repo,
      base_tree: parent.data.tree.sha,
      tree: writes.map((file: (typeof writes)[number]) => ({
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
      parents: [ref.data.object.sha],
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
      body: input.body,
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
        message: createdBranch
          ? `${message} Branch ${input.branch} was created, but the pull request was not opened.`
          : message,
        branch: createdBranch ? input.branch : undefined,
      },
    };
  }
}
