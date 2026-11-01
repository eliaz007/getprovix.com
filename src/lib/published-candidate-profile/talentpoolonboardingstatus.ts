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

export type TalentPoolOnboardingStatus = {
  /** Employer visibility toggle is on (is_visible_in_pool / visible_to_employers). */
  isVisibleInPool: boolean;
  /** Live on roster: visible + qualifying score + employer-active engagement. */
  isLiveOnRoster: boolean;
  hasEngagementMode: boolean;
  /** Contract-only + missing bandwidth/rate — amber Action Needed. */
  needsContractPlacementDetails: boolean;
  /** Live with contract-only engagement (bandwidth + rate set). */
  isContractOnlyLive: boolean;
  scoreMet: boolean;
  githubVerified: boolean;
  profileDetailsComplete: boolean;
  missingFieldLabels: string[];
  auditScore: number | null;
};
