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
import { hasTalentPoolEngagementMode } from "./hastalentpoolengagementmode";
import { hasCompleteContractPlacementDetails } from "./hascompletecontractplacementdetails";
import { isContractOnlyEngagement } from "./iscontractonlyengagement";
import { hasEmployerActiveEngagement } from "./hasemployeractiveengagement";
import { getMissingTalentPoolProfileFieldLabels } from "./getmissingtalentpoolprofilefieldlabels";
import type { TalentPoolOnboardingStatus } from "./talentpoolonboardingstatus";
import { resolveHighestProductionScore } from "./resolvehighestproductionscore";

export function getTalentPoolOnboardingStatus(
  row: PublishedCandidateProfileRow | null | undefined
): TalentPoolOnboardingStatus {
  const auditScore = resolveHighestProductionScore(row);
  const scoreMet = hasQualifyingTalentPoolAudit(auditScore);
  const githubVerified = row?.github_verified === true;
  const missingFieldLabels = getMissingTalentPoolProfileFieldLabels(row);
  const profileDetailsComplete = missingFieldLabels.length === 0;
  const isVisibleInPool = profileRowIsPublicToEmployers(row ?? {});
  const hasEngagementMode = hasTalentPoolEngagementMode(row);
  const contractDetailsComplete = hasCompleteContractPlacementDetails(row);
  const needsContractPlacementDetails =
    isVisibleInPool &&
    isContractOnlyEngagement(row) &&
    !contractDetailsComplete;
  const hasActiveEngagement = hasEmployerActiveEngagement(row);
  const isLiveOnRoster = isVisibleInPool && scoreMet && hasActiveEngagement;

  return {
    isVisibleInPool,
    isLiveOnRoster,
    hasEngagementMode,
    needsContractPlacementDetails,
    isContractOnlyLive: isLiveOnRoster && isContractOnlyEngagement(row),
    scoreMet,
    githubVerified,
    profileDetailsComplete,
    missingFieldLabels,
    auditScore,
  };
}
