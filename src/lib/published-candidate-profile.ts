import {
  isEmployeeRole,
  isEmployerRole,
} from "@/lib/dashboard-account";
import { profileRowIsPublicToEmployers } from "@/lib/opportunities-metrics";
import { isValidGitHubUrl } from "@/lib/validate-github-url";

export type PublishedCandidateProfileRow = {
  id?: string | null;
  profile_slug?: string | null;
  role?: string | null;
  full_name?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  job_title?: string | null;
  headline?: string | null;
  bio?: string | null;
  skills?: string[] | string | null;
  portfolio_url?: string | null;
  youtube_url?: string | null;
  experience_level?: string | null;
  availability_status?: string | null;
  availability?: string | null;
  university?: string | null;
  school?: string | null;
  major?: string | null;
  degree?: string | null;
  work_preference?: string | null;
  timezone?: string | null;
  is_visible_in_pool?: boolean | string | number | null;
  visible_to_employers?: boolean | string | number | null;
};

function isNonEmptyText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
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

function hasDisplayName(row: PublishedCandidateProfileRow): boolean {
  return (
    isNonEmptyText(row.full_name) ||
    isNonEmptyText(row.name) ||
    isNonEmptyText(row.first_name) ||
    isNonEmptyText(row.last_name)
  );
}

function hasAnyNonEmptyText(...values: unknown[]): boolean {
  return values.some(isNonEmptyText);
}

/**
 * True only when every required Profile Studio field is filled.
 * Null, missing, blank, and whitespace-only values do not count.
 */
export function hasCompleteRequiredProfileFields(
  row: PublishedCandidateProfileRow | null | undefined
): boolean {
  if (!row) {
    return false;
  }

  return (
    hasDisplayName(row) &&
    hasAnyNonEmptyText(row.job_title, row.headline) &&
    isNonEmptyText(row.bio) &&
    hasRequiredSkills(row.skills) &&
    isNonEmptyText(row.experience_level) &&
    hasAnyNonEmptyText(row.university, row.school) &&
    hasAnyNonEmptyText(row.major, row.degree) &&
    hasAnyNonEmptyText(row.availability_status, row.availability) &&
    isNonEmptyText(row.work_preference) &&
    isNonEmptyText(row.timezone) &&
    hasCandidateGitHubProfile(row)
  );
}

export function isVerifiedOnProvix(
  row: PublishedCandidateProfileRow | null | undefined
): boolean {
  return hasCompleteRequiredProfileFields(row);
}

export function hasCandidateGitHubProfile(
  row: Pick<PublishedCandidateProfileRow, "portfolio_url">
): boolean {
  return isValidGitHubUrl(row.portfolio_url ?? "");
}

export function hasCandidateProofOfWork(
  row: Pick<PublishedCandidateProfileRow, "portfolio_url" | "youtube_url">
): boolean {
  return (
    hasCandidateGitHubProfile(row) || Boolean(row.youtube_url?.trim())
  );
}

export function isPublishedVerifiedCandidateProfile(
  row: PublishedCandidateProfileRow
): boolean {
  if (!row.id?.trim()) {
    return false;
  }

  const visibilitySpecified =
    row.is_visible_in_pool !== undefined ||
    row.visible_to_employers !== undefined;

  if (visibilitySpecified && !profileRowIsPublicToEmployers(row)) {
    return false;
  }

  if (isEmployerRole(row.role) || isEmployeeRole(row.role)) {
    return false;
  }

  return isVerifiedOnProvix(row);
}
