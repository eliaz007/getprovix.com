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
  open_to_fulltime?: boolean | string | number | null;
  open_to_contract?: boolean | string | number | null;
  contract_hours_per_week?: string | null;
  contract_hourly_rate?: number | string | null;
  /** UI aliases — mapped onto the contract_* columns when present. */
  weekly_bandwidth?: string | null;
  target_payout_rate?: number | string | null;
  integrity_score?: number | string | null;
  production_score?: number | string | null;
  audit_score?: number | string | null;
  github_verified?: boolean | null;
  github_username?: string | null;
  audit_data?: unknown;
  github_audit?: unknown;
};
