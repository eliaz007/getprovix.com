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

export function hasCandidateGitHubProfile(
  row: Pick<PublishedCandidateProfileRow, "portfolio_url">
): boolean {
  // Featured repository (owner/repo) — profile-only URLs no longer satisfy completion.
  return hasUsableGitHubAuditTarget(row.portfolio_url ?? "");
}
