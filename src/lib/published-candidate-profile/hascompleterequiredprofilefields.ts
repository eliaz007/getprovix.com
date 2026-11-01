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
import { isNonEmptyText } from "./isnonemptytext";
import { hasCoreTalentPoolProfileFields } from "./hascoretalentpoolprofilefields";
import { hasCandidateGitHubProfile } from "./hascandidategithubprofile";

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
