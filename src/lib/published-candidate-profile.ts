import {
  isEmployeeRole,
  isEmployerRole,
} from "@/lib/dashboard-account";
import { DEFAULT_AVAILABILITY_STATUS } from "@/lib/availability-status";
import { parseExecutiveBrief } from "@/lib/executive-brief";
import {
  githubAuditHasFetchedArtifacts,
  type GitHubAuditContext,
} from "@/lib/github-audit";
import { parseRepoFilesystemEvidence } from "@/lib/repo-filesystem";
import { profileRowIsPublicToEmployers } from "@/lib/opportunities-metrics";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  hasUsableExternalProjects,
  normalizeExternalProjects,
} from "@/lib/external-projects";
import { hasUsableGitHubAuditTarget } from "@/lib/validate-github-url";
import { hasQualifyingTalentPoolAudit } from "@/lib/talent-pool-visibility";
import {
  DEFAULT_CANDIDATE_TIMEZONE,
  DEFAULT_WORK_PREFERENCE,
} from "@/lib/work-preference";

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
  production_score?: number | string | null;
  audit_score?: number | string | null;
  github_verified?: boolean | null;
  github_username?: string | null;
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

/** Core Profile Studio fields required for talent-network publication. */
export function hasCoreTalentPoolProfileFields(
  row: PublishedCandidateProfileRow | null | undefined
): boolean {
  if (!row) {
    return false;
  }

  return (
    hasDisplayName(row) &&
    hasAnyNonEmptyText(row.job_title, row.headline) &&
    isNonEmptyText(row.bio) &&
    hasRequiredSkills(row.skills)
  );
}

/**
 * True when required Profile Studio fields are filled.
 * Timezone, work preference, and availability fall back to product defaults
 * and no longer block publication eligibility.
 */
export function hasCompleteRequiredProfileFields(
  row: PublishedCandidateProfileRow | null | undefined
): boolean {
  if (!row) {
    return false;
  }

  return (
    hasCoreTalentPoolProfileFields(row) &&
    isNonEmptyText(row.experience_level) &&
    hasCandidateGitHubProfile(row)
  );
}

export type TalentPoolMissingField =
  | "name"
  | "title"
  | "bio"
  | "skills"
  | "experience_level"
  | "featured_github_repo";

const MISSING_FIELD_LABELS: Record<TalentPoolMissingField, string> = {
  name: "Name",
  title: "Job title / headline",
  bio: "Bio",
  skills: "Skills",
  experience_level: "Experience level",
  featured_github_repo: "Featured GitHub repository (owner/repo)",
};

/** Human-readable labels for incomplete publication fields. */
export function getMissingTalentPoolProfileFieldLabels(
  row: PublishedCandidateProfileRow | null | undefined
): string[] {
  return listMissingTalentPoolProfileFields(row).map(
    (field) => MISSING_FIELD_LABELS[field]
  );
}

/** Missing core fields that block auto-publish (excludes defaulted metadata). */
export function listMissingTalentPoolProfileFields(
  row: PublishedCandidateProfileRow | null | undefined
): TalentPoolMissingField[] {
  if (!row) {
    return ["name", "title", "bio", "skills"];
  }

  const missing: TalentPoolMissingField[] = [];
  if (!hasDisplayName(row)) {
    missing.push("name");
  }
  if (!hasAnyNonEmptyText(row.job_title, row.headline)) {
    missing.push("title");
  }
  if (!isNonEmptyText(row.bio)) {
    missing.push("bio");
  }
  if (!hasRequiredSkills(row.skills)) {
    missing.push("skills");
  }
  return missing;
}

/** Defaults applied when persisting non-critical metadata for pool eligibility. */
export function talentPoolMetadataDefaults(row?: {
  work_preference?: string | null;
  timezone?: string | null;
  availability_status?: string | null;
  availability?: string | null;
}): {
  work_preference: string;
  timezone: string;
  availability_status: string;
} {
  return {
    work_preference: isNonEmptyText(row?.work_preference)
      ? String(row?.work_preference).trim()
      : DEFAULT_WORK_PREFERENCE,
    timezone: isNonEmptyText(row?.timezone)
      ? String(row?.timezone).trim()
      : DEFAULT_CANDIDATE_TIMEZONE,
    availability_status: hasAnyNonEmptyText(
      row?.availability_status,
      row?.availability
    )
      ? String(row?.availability_status ?? row?.availability).trim()
      : DEFAULT_AVAILABILITY_STATUS,
  };
}

/**
 * Auto-publish gate: 75+ score, linked GitHub, and core profile fields.
 * Matches the criteria used by profile-save and audit-completion handlers.
 */
export function meetsTalentPoolAutoPublishCriteria(
  row: PublishedCandidateProfileRow | null | undefined
): boolean {
  if (!row || isEmployerRole(row.role) || isEmployeeRole(row.role)) {
    return false;
  }

  if (row.github_verified !== true) {
    return false;
  }

  if (!hasCoreTalentPoolProfileFields(row)) {
    return false;
  }

  const productionScore = resolveHighestProductionScore(row);
  return hasQualifyingTalentPoolAudit(productionScore);
}

export type TalentPoolOnboardingStatus = {
  isVisibleInPool: boolean;
  scoreMet: boolean;
  githubVerified: boolean;
  profileDetailsComplete: boolean;
  missingFieldLabels: string[];
  auditScore: number | null;
};

export function getTalentPoolOnboardingStatus(
  row: PublishedCandidateProfileRow | null | undefined
): TalentPoolOnboardingStatus {
  const auditScore = resolveHighestProductionScore(row);
  const scoreMet = hasQualifyingTalentPoolAudit(auditScore);
  const githubVerified = row?.github_verified === true;
  const missingFieldLabels = getMissingTalentPoolProfileFieldLabels(row);
  const profileDetailsComplete = missingFieldLabels.length === 0;

  return {
    isVisibleInPool: profileRowIsPublicToEmployers(row ?? {}),
    scoreMet,
    githubVerified,
    profileDetailsComplete,
    missingFieldLabels,
    auditScore,
  };
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
    is_fork: record.is_fork === true,
    parent_full_name:
      typeof record.parent_full_name === "string" && record.parent_full_name.trim()
        ? record.parent_full_name.trim()
        : null,
    template_repository:
      typeof record.template_repository === "string" &&
      record.template_repository.trim()
        ? record.template_repository.trim()
        : null,
    is_upstream_derivative: record.is_upstream_derivative === true,
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
    filesystem: parseRepoFilesystemEvidence(record.filesystem),
    executiveBrief: parseExecutiveBrief(record.executiveBrief),
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

/** Highest usable production/audit score for Verified-on-Provix gating. */
export function resolveHighestProductionScore(
  row:
    | Pick<PublishedCandidateProfileRow, "production_score" | "audit_score">
    | null
    | undefined
): number | null {
  if (!row) {
    return null;
  }

  const scores = [row.production_score, row.audit_score]
    .map((value) => readNumericScore(value))
    .filter((value): value is number => value != null);

  if (scores.length === 0) {
    return null;
  }

  return Math.max(...scores);
}

/**
 * Verified on Provix requires core profile fields, a linked GitHub identity,
 * and a production audit score of 75+. Non-critical metadata uses defaults.
 */
export function isVerifiedOnProvix(
  row: PublishedCandidateProfileRow | null | undefined
): boolean {
  return meetsTalentPoolAutoPublishCriteria(row);
}

export function hasCandidateGitHubProfile(
  row: Pick<PublishedCandidateProfileRow, "portfolio_url">
): boolean {
  // Featured repository (owner/repo) — profile-only URLs no longer satisfy completion.
  return hasUsableGitHubAuditTarget(row.portfolio_url ?? "");
}

export function hasCandidateProofOfWork(
  row: Pick<PublishedCandidateProfileRow, "portfolio_url" | "youtube_url">
): boolean {
  return (
    hasCandidateGitHubProfile(row) || Boolean(row.youtube_url?.trim())
  );
}

/**
 * Employer talent-pool eligibility: published (visible) + verified/complete.
 * Bare signup profiles fail until required Profile Studio fields and proof-of-work
 * audit are in place — matching the empty-state copy on /dashboard?tab=talent.
 */
export function isPublishedVerifiedCandidateProfile(
  row: PublishedCandidateProfileRow
): boolean {
  return explainPublishedVerifiedCandidateRejection(row) === null;
}

/** Null when the row passes; otherwise the exact failing gate. */
export function explainPublishedVerifiedCandidateRejection(
  row: PublishedCandidateProfileRow
): string | null {
  if (!row.id?.trim()) {
    return "missing id";
  }

  if (!profileRowIsPublicToEmployers(row)) {
    return `not public to employers (is_visible_in_pool=${String(row.is_visible_in_pool)}, visible_to_employers=${String(row.visible_to_employers)})`;
  }

  if (isEmployerRole(row.role)) {
    return `role is employer/business (role=${String(row.role)})`;
  }

  if (isEmployeeRole(row.role)) {
    return `role is employee (role=${String(row.role)})`;
  }

  if (row.github_verified !== true) {
    return `github_verified !== true (github_verified=${String(row.github_verified)})`;
  }

  if (!hasCoreTalentPoolProfileFields(row)) {
    const missing = getMissingTalentPoolProfileFieldLabels(row);
    return `missing core profile fields: ${missing.join(", ") || "unknown"}`;
  }

  const productionScore = resolveHighestProductionScore(row);
  if (!hasQualifyingTalentPoolAudit(productionScore)) {
    return `score below 75 (production_score=${String(row.production_score)}, audit_score=${String(row.audit_score)}, resolved=${String(productionScore)})`;
  }

  return null;
}
