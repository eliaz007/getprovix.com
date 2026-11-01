import { generateMaskedAliasFromUuid, getCodenameInitials } from "@/lib/alias-generator";
import { getPublicCandidateLocation } from "@/lib/candidate-anonymization";
import {
  isCannedMatchScore,
  scoreTalentMatch,
  type MatchResult,
} from "@/lib/match-heuristic";
import {
  getFitVerdictBadgeClass,
  scoreToFitVerdict,
  type FitVerdict,
} from "@/lib/opportunity-match";
import { isVerifiedOnProvix } from "@/lib/published-candidate-profile";
import { resolvedProfileId } from "@/lib/resolve-candidate-profile";
import { employerVisibleProductionAudit, parseProductionAuditFromProfileRow } from "@/lib/production-audit";
import { clampScore0to100 } from "@/lib/score-scale";
import { normalizeAvailabilityStatus } from "@/lib/availability-status";
import {
  normalizeContractHourlyRate,
  normalizeContractHoursPerWeek,
  normalizeOpenToContract,
  normalizeOpenToFulltime,
} from "@/lib/contract-availability";
import { DEFAULT_EXPERIENCE_LEVEL } from "@/lib/experience-level";
import {
  parseProofOfWorkProjects,
  resolveCandidateGithubUrl,
  type TalentPoolCandidate,
} from "@/lib/talent-pool-candidate";
import { formatGpa } from "@/lib/gpa";
import { educationFromProfileRow } from "@/lib/talent-pool-profiles";
import {
  DEFAULT_WORK_PREFERENCE,
  normalizeCandidateTimezone,
  normalizeWorkPreference,
} from "@/lib/work-preference";

export type ApplicantProfileRow = {
  id?: string;
  user_id?: string | null;
  codename_alias?: string | null;
  full_name?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  contact_email?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  skills?: string[] | null;
  timezone?: string | null;
  country?: string | null;
  job_title?: string | null;
  headline?: string | null;
  bio?: string | null;
  experience_level?: string | null;
  major?: string | null;
  degree?: string | null;
  school?: string | null;
  university?: string | null;
  gpa?: string | number | null;
  graduation_year?: number | string | null;
  education?: unknown;
  is_self_taught?: boolean | string | number | null;
  portfolio_url?: string | null;
  youtube_url?: string | null;
  availability_status?: string | null;
  availability?: string | null;
  work_preference?: string | null;
  open_to_fulltime?: boolean | null;
  open_to_contract?: boolean | null;
  contract_hours_per_week?: string | null;
  contract_hourly_rate?: number | string | null;
  role?: string | null;
  key_accomplishments?: string | null;
  github_url?: string | null;
  integrity_score?: number | string | null;
  audit_data?: unknown;
  production_score?: number | string | null;
  audit_breakdown?: unknown;
  is_audit_verified?: boolean | null;
  is_publicly_visible?: boolean | null;
  verification_status?: string | null;
};
