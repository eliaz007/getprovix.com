import {
  isEmployeeRole,
  isEmployerRole,
} from "@/lib/dashboard-account";
import { isVisibleToEmployers } from "@/lib/opportunities-metrics";
import { isValidGitHubUrl } from "@/lib/validate-github-url";

export type PublishedCandidateProfileRow = {
  id?: string | null;
  profile_slug?: string | null;
  role?: string | null;
  job_title?: string | null;
  bio?: string | null;
  portfolio_url?: string | null;
  youtube_url?: string | null;
  is_visible_in_pool?: boolean | null;
};

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

  if (!isVisibleToEmployers(row.is_visible_in_pool)) {
    return false;
  }

  if (isEmployerRole(row.role) || isEmployeeRole(row.role)) {
    return false;
  }

  if (!row.job_title?.trim()) {
    return false;
  }

  if (!row.bio?.trim()) {
    return false;
  }

  if (!hasCandidateGitHubProfile(row)) {
    return false;
  }

  return true;
}
