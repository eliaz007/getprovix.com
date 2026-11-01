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
import { isNonEmptyText } from "./isnonemptytext";
import { hasAnyNonEmptyText } from "./hasanynonemptytext";

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
