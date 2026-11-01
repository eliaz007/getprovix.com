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
  normalizeContractHourlyRate,
  normalizeContractHoursPerWeek,
} from "@/lib/contract-availability";
import {
  DEFAULT_CANDIDATE_TIMEZONE,
  DEFAULT_WORK_PREFERENCE,
} from "@/lib/work-preference";
import type { PublishedCandidateProfileRow } from "./publishedcandidateprofilerow";
import { hasCoreTalentPoolProfileFields } from "./hascoretalentpoolprofilefields";
import { resolveHighestProductionScore } from "./resolvehighestproductionscore";

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
