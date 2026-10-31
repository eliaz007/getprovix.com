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
import { statusOf } from "./statusof";

export function failureMessage(error: unknown): string {
  const status = statusOf(error);
  const raw = error instanceof Error ? error.message : "";
  if (status === 401) {
    return "GITHUB_TOKEN was rejected. Use a token that can push to this repository.";
  }
  if (status === 403 && /rate limit/i.test(raw)) {
    return "GitHub rate limit reached. Wait and try again, or use a token with a higher limit.";
  }
  if (status === 403) {
    return "GITHUB_TOKEN cannot create a branch or pull request on this repository.";
  }
  if (status === 404) {
    return "GitHub could not find that repository or branch. The token may not have access.";
  }
  if (status === 422) {
    return "GitHub rejected the pull request. The branch may already exist, or the split did not change any files.";
  }
  return "The pull request could not be opened.";
}
