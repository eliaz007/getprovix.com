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
import type { ApplicantReviewStatus } from "./applicantreviewstatus";

export function applicantStatusClass(status: ApplicantReviewStatus): string {
  switch (status) {
    case "rejected":
      return "bg-rose-500/10 text-rose-300 border-rose-500/20";
    case "intro_requested":
      return "bg-indigo-500/10 text-indigo-300 border-indigo-500/20";
    default:
      return "bg-violet-500/10 text-violet-300 border-violet-500/20";
  }
}

export { getFitVerdictBadgeClass };
