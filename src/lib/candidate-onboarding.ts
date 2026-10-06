import { hasUsableGitHubAuditTarget } from "@/lib/validate-github-url";

/** Candidate profile setup form (post role-pick). */
export const CANDIDATE_SETUP_PATH = "/onboarding";

/** Landing path after setup — Code & Resume Auditor with featured repo ready. */
export const CANDIDATE_SETUP_COMPLETE_PATH = "/dashboard/auditor";

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
  fullName: string;
  jobTitle: string;
  bio: string;
  skillsInput: string;
  experienceLevel: string;
  githubUrl: string;
};

function isNonEmptyText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasDisplayName(row: CandidateSetupProfileRow): boolean {
  return (
    isNonEmptyText(row.full_name) ||
    isNonEmptyText(row.name) ||
    isNonEmptyText(row.first_name) ||
    isNonEmptyText(row.last_name)
  );
}

function hasRequiredSkills(skills: unknown): boolean {
  if (typeof skills === "string") {
    return skills.split(",").some((skill) => skill.trim().length > 0);
  }

  if (!Array.isArray(skills)) {
    return false;
  }

  return skills.some(
    (skill) => typeof skill === "string" && skill.trim().length > 0
  );
}

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
 * True when the /onboarding setup form fields are filled.
 * Used by middleware and post-auth routing to gate the full dashboard.
 */
export function hasCompletedCandidateSetup(
  row: CandidateSetupProfileRow | null | undefined
): boolean {
  if (!row) {
    return false;
  }

  return (
    hasDisplayName(row) &&
    (isNonEmptyText(row.job_title) || isNonEmptyText(row.headline)) &&
    isNonEmptyText(row.bio) &&
    hasRequiredSkills(row.skills) &&
    isNonEmptyText(row.experience_level) &&
    hasFeaturedGitHubRepository(row.portfolio_url)
  );
}

export function isCandidateSetupPath(pathname: string): boolean {
  return pathname === CANDIDATE_SETUP_PATH;
}

export function parseSkillsInput(value: string): string[] {
  return value
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
}

/** Post-onboarding destination with featured repo prefilled in the auditor. */
export function buildAuditorSetupPath(githubUrl: string): string {
  const trimmed = githubUrl.trim();
  if (!trimmed) {
    return CANDIDATE_SETUP_COMPLETE_PATH;
  }
  const params = new URLSearchParams();
  params.set("github", trimmed);
  return `${CANDIDATE_SETUP_COMPLETE_PATH}?${params.toString()}`;
}
