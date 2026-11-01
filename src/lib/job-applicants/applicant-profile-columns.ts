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

export const APPLICANT_PROFILE_COLUMNS = [
  "id",
  "user_id",
  "codename_alias",
  "full_name",
  "name",
  "first_name",
  "last_name",
  "contact_email",
  "email",
  "phone",
  "linkedin_url",
  "skills",
  "timezone",
  "country",
  "job_title",
  "headline",
  "bio",
  "experience_level",
  "major",
  "degree",
  "school",
  "university",
  "gpa",
  "graduation_year",
  "education",
  "is_self_taught",
  "portfolio_url",
  "youtube_url",
  "availability_status",
  "availability",
  "work_preference",
  "open_to_fulltime",
  "open_to_contract",
  "contract_hours_per_week",
  "contract_hourly_rate",
  "role",
  "key_accomplishments",
  "integrity_score",
  "audit_data",
  "production_score",
  "audit_breakdown",
  "is_audit_verified",
  "is_publicly_visible",
  "verification_status",
] as const;
