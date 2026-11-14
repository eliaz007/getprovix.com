import type { FirewallAutofixPullRequestResponse } from "@/lib/firewall-contract";
import { normalizeCommitSha, openSecurityFixPullRequest } from "@/lib/github-autofix-pr";
import { toGitHubOwnerRepo } from "@/lib/github-repo-ref";
import { isRepositoryTextPath, readGitHubTextFile } from "@/lib/github-source-file";
import {
  adaptPvimFinding,
  type PvimFindingLike,
  type PvimRemediationRejectCode,
} from "@/lib/pvim/pvim-remediation-adapter";

export type PvimRemediationResult =
  | {
      ok: true;
      status: number;
      body: FirewallAutofixPullRequestResponse;
    }
  | {
      ok: false;
      status: number;
      code: PvimRemediationRejectCode;
      message: string;
      body: FirewallAutofixPullRequestResponse & { code: PvimRemediationRejectCode };
    };

/**
 * Adapt a PVIM shadow finding, then open the existing security fix PR path.
 * Unsupported findings return a structured failure and never touch the PR pipeline.
 */
export async function openPvimRemediationPullRequest(
  repoInput: string,
  finding: PvimFindingLike,
  options: {
    token: string;
    commitSha: string;
    snippet?: string | null;
    contentAtPath?: (filePath: string) => string | null;
  }
): Promise<PvimRemediationResult> {
  const pin = normalizeCommitSha(options.commitSha);
  if (!pin) {
    const message = "commitSha must be a Git SHA.";
    return {
      ok: false,
      status: 400,
      code: "invalid_commit_sha",
      message,
      body: { ok: false, message, code: "invalid_commit_sha" },
    };
  }

  const ownerRepo = toGitHubOwnerRepo(repoInput);
  const repoUrl = ownerRepo ? `https://github.com/${ownerRepo}` : repoInput.trim();

  const provisionalPath =
    typeof finding.path === "string" && finding.path.trim()
      ? finding.path.replace(/\\/g, "/").replace(/^\/+/, "").trim()
      : finding.evidence?.find((step) => typeof step.path === "string" && step.path.trim())?.path
          ?.replace(/\\/g, "/")
          .replace(/^\/+/, "")
          .trim() ?? null;

  let pinnedContent: string | null = null;
  if (provisionalPath && isRepositoryTextPath(provisionalPath)) {
    if (options.contentAtPath) {
      pinnedContent = options.contentAtPath(provisionalPath);
    } else {
      const remote = await readGitHubTextFile(repoUrl, provisionalPath, {
        auth: options.token,
        ref: pin,
      });
      pinnedContent = remote.ok ? remote.content : null;
    }
  }

  const decision = adaptPvimFinding(finding, {
    commitSha: pin,
    contentAtPath: (filePath) => {
      const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
      if (options.contentAtPath) {
        const provided = options.contentAtPath(normalized);
        if (provided != null) return provided;
      }
      if (provisionalPath && normalized === provisionalPath) return pinnedContent;
      return null;
    },
  });

  if (!decision.ok) {
    return {
      ok: false,
      status: 422,
      code: decision.code,
      message: decision.message,
      body: { ok: false, message: decision.message, code: decision.code },
    };
  }

  const opened = await openSecurityFixPullRequest(
    repoInput,
    decision.filePath,
    decision.line,
    decision.category,
    {
      token: options.token,
      commitSha: decision.commitSha,
      snippet: options.snippet ?? decision.snippet ?? null,
      pvim: {
        findingId: decision.sourceFindingId,
        ruleId:
          typeof finding.rule_id === "string" && finding.rule_id.trim()
            ? finding.rule_id.trim()
            : decision.sourceFindingId,
        filePath: decision.filePath,
        commitSha: decision.commitSha,
      },
    }
  );

  return {
    ok: true,
    status: opened.status,
    body: opened.body,
  };
}
