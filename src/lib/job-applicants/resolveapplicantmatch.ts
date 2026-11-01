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

export function resolveApplicantMatch(
  cached: MatchResult | number | null | undefined,
  candidate: { skills: string[]; headline: string; bio?: string | null },
  job: {
    title: string;
    techStack?: string[] | string | null;
    requiredSkills?: string[] | string | null;
    tags?: string[] | string | null;
  }
): MatchResult {
  const heuristic = scoreTalentMatch(
    {
      title: candidate.headline,
      skills: candidate.skills,
      bio: candidate.bio ?? "",
    },
    {
      title: job.title,
      techStack: job.techStack ?? undefined,
      requiredSkills: job.requiredSkills ?? undefined,
      tags: job.tags ?? undefined,
    }
  );

  if (typeof cached === "number" && Number.isFinite(cached) && !isCannedMatchScore(cached)) {
    return {
      ...heuristic,
      match_percentage: clampScore0to100(cached),
    };
  }

  if (cached && typeof cached === "object") {
    const score = clampScore0to100(cached.match_percentage);
    if (Number.isFinite(score) && !isCannedMatchScore(score)) {
      return {
        match_percentage: score,
        reasoning: cached.reasoning?.trim() || heuristic.reasoning,
        matching_skills:
          cached.matching_skills.length > 0
            ? cached.matching_skills
            : heuristic.matching_skills,
        missing_skills:
          cached.missing_skills.length > 0
            ? cached.missing_skills
            : heuristic.missing_skills,
      };
    }
  }

  return heuristic;
}
