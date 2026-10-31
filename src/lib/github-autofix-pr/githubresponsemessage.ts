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

export function githubResponseMessage(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    const data = (error as { response?: { data?: { message?: unknown } } }).response?.data;
    if (typeof data?.message === "string" && data.message.trim()) return data.message.trim();
  }
  return error instanceof Error ? error.message : "Unknown GitHub error";
}
