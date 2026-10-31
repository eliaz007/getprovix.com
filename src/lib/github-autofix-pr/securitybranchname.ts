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

export function securityBranchName(slug: string, filePath: string): string {
  const fileSlug = filePath
    .replace(/\.(tsx|ts|jsx|js|json)$/i, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .toLowerCase();
  return `provix/security-${slug}-${fileSlug || "fix"}-${Date.now().toString(36)}`;
}
