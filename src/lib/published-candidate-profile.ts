import {
  isEmployeeRole,
  isEmployerRole,
} from "@/lib/dashboard-account";
import {
  githubAuditHasFetchedArtifacts,
  type GitHubAuditContext,
} from "@/lib/github-audit";
import { profileRowIsPublicToEmployers } from "@/lib/opportunities-metrics";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  hasUsableExternalProjects,
  normalizeExternalProjects,
} from "@/lib/external-projects";
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
  integrity_score?: number | string | null;
  audit_data?: unknown;
  github_audit?: unknown;
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
    (hasCandidateGitHubProfile(row) || hasSuccessfulExternalProjectsAudit(row))
  );
}

function readNumericScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampScore0to100(value);
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number.parseFloat(value);
    if (Number.isFinite(numeric)) {
      return clampScore0to100(numeric);
    }
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readGitHubAuditContext(value: unknown): GitHubAuditContext | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    repo_url: typeof record.repo_url === "string" ? record.repo_url : "",
    owner: typeof record.owner === "string" ? record.owner : "",
    repo: typeof record.repo === "string" ? record.repo : "",
    stars: typeof record.stars === "number" ? record.stars : null,
    forks: typeof record.forks === "number" ? record.forks : null,
    created_at: typeof record.created_at === "string" ? record.created_at : null,
    language: typeof record.language === "string" ? record.language : null,
    commit_count_sampled:
      typeof record.commit_count_sampled === "number"
        ? record.commit_count_sampled
        : 0,
    commit_dates: Array.isArray(record.commit_dates)
      ? record.commit_dates.filter((date): date is string => typeof date === "string")
      : [],
    readme_excerpt:
      typeof record.readme_excerpt === "string" ? record.readme_excerpt : null,
    fetch_warnings: Array.isArray(record.fetch_warnings)
      ? record.fetch_warnings.filter(
          (warning): warning is string => typeof warning === "string"
        )
      : [],
  };
}

export function resolveStoredIntegrityScore(
  row: Pick<
    PublishedCandidateProfileRow,
    "integrity_score" | "audit_data"
  > | null | undefined
): number | null {
  if (!row) {
    return null;
  }

  const fromColumn = readNumericScore(row.integrity_score);
  if (fromColumn != null) {
    return fromColumn;
  }

  const auditData = asRecord(row.audit_data);
  return readNumericScore(auditData?.integrity_score);
}

/**
 * True when a GitHub integrity audit finished and produced repo artifacts
 * (or a persisted integrity score from an older audit that predated github_audit).
 */
export function hasSuccessfulGitHubIntegrityAudit(
  row:
    | Pick<
        PublishedCandidateProfileRow,
        "integrity_score" | "audit_data" | "github_audit"
      >
    | null
    | undefined
): boolean {
  if (!row) {
    return false;
  }

  if (resolveStoredIntegrityScore(row) == null) {
    return false;
  }

  const auditData = asRecord(row.audit_data);
  const githubAudit = readGitHubAuditContext(
    row.github_audit ?? auditData?.github_audit
  );

  if (!githubAudit) {
    return true;
  }

  return githubAuditHasFetchedArtifacts(githubAudit);
}

export function hasSuccessfulExternalProjectsAudit(
  row:
    | Pick<PublishedCandidateProfileRow, "integrity_score" | "audit_data">
    | null
    | undefined
): boolean {
  if (!row || resolveStoredIntegrityScore(row) == null) {
    return false;
  }

  const auditData = asRecord(row.audit_data);
  const source =
    typeof auditData?.source === "string" ? auditData.source.trim().toLowerCase() : "";

  if (
    source === "external_projects_audit" ||
    source === "external_projects" ||
    source === "hybrid_artifact_audit"
  ) {
    return true;
  }

  return hasUsableExternalProjects(
    normalizeExternalProjects(auditData?.external_projects)
  );
}

export function isVerifiedOnProvix(
  row: PublishedCandidateProfileRow | null | undefined
): boolean {
  return (
    hasCompleteRequiredProfileFields(row) &&
    (hasSuccessfulGitHubIntegrityAudit(row) ||
      hasSuccessfulExternalProjectsAudit(row))
  );
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
