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
import { hasCompleteContractPlacementDetails } from "./hascompletecontractplacementdetails";
import { isContractOnlyEngagement } from "./iscontractonlyengagement";
import { hasCoreTalentPoolProfileFields } from "./hascoretalentpoolprofilefields";
import { getMissingTalentPoolProfileFieldLabels } from "./getmissingtalentpoolprofilefieldlabels";
import { resolveHighestProductionScore } from "./resolvehighestproductionscore";

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

  // Contract-only without bandwidth/rate stays out of employer searches.
  if (
    isContractOnlyEngagement(row) &&
    !hasCompleteContractPlacementDetails(row)
  ) {
    return "contract-only missing weekly bandwidth or target payout rate (> 0)";
  }

  return null;
}
