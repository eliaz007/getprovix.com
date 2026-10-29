import { toGitHubOwnerRepo } from "@/lib/github-repo-ref";
import { hasUsableGitHubAuditTarget } from "@/lib/validate-github-url";

/** Candidate profile setup form (post role-pick). */
export const CANDIDATE_SETUP_PATH = "/onboarding";

/** Landing path after setup — architecture firewall with the repository ready. */
export const CANDIDATE_SETUP_COMPLETE_PATH = "/firewall";

export const CANDIDATE_ONBOARDING_DRAFT_KEY = "provix_candidate_onboarding_draft";

export type CandidateSetupProfileRow = {
  full_name?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  job_title?: string | null;
  headline?: string | null;
  bio?: string | null;
  skills?: string[] | string | null;
  experience_level?: string | null;
  portfolio_url?: string | null;
};

export type CandidateOnboardingDraft = {
  fullName?: string;
  jobTitle?: string;
  githubUrl: string;
  contactEmail?: string;
};

/** Featured public repo required for onboarding + talent-pool completeness. */
export function hasFeaturedGitHubRepository(
  portfolioUrl: string | null | undefined
): boolean {
  return hasUsableGitHubAuditTarget(portfolioUrl);
}

export function getFeaturedRepoValidationMessage(
  input: string
): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return "Enter a featured GitHub repository URL.";
  }

  if (!hasUsableGitHubAuditTarget(trimmed)) {
    return "Enter a full repository URL (e.g. https://github.com/username/repo-name).";
  }

  return null;
}

/**
 * True when the candidate has saved a featured owner/repo URL.
 * Identity verification is enforced in the onboarding UI before save.
 */
export function hasCompletedCandidateSetup(
  row: CandidateSetupProfileRow | null | undefined
): boolean {
  if (!row) {
    return false;
  }

  return hasFeaturedGitHubRepository(row.portfolio_url);
}

export function isCandidateSetupPath(pathname: string): boolean {
  return pathname === CANDIDATE_SETUP_PATH;
}

/** Post-onboarding destination with the repository prefilled in the firewall. */
export function buildAuditorSetupPath(githubUrl: string): string {
  const trimmed = githubUrl.trim();
  if (!trimmed) {
    return CANDIDATE_SETUP_COMPLETE_PATH;
  }
  const params = new URLSearchParams();
  params.set("repo", toGitHubOwnerRepo(trimmed) ?? trimmed);
  return `${CANDIDATE_SETUP_COMPLETE_PATH}?${params.toString()}`;
}
