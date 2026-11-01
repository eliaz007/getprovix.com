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
import { coerceEngagementFlag } from "./coerceengagementflag";
import { hasCompleteContractPlacementDetails } from "./hascompletecontractplacementdetails";

/** Engagement that actually unlocks employer visibility. */
export function hasEmployerActiveEngagement(
  row: PublishedCandidateProfileRow | null | undefined
): boolean {
  if (!row) {
    return false;
  }
  if (coerceEngagementFlag(row.open_to_fulltime)) {
    return true;
  }
  if (
    coerceEngagementFlag(row.open_to_contract) &&
    hasCompleteContractPlacementDetails(row)
  ) {
    return true;
  }
  return false;
}
