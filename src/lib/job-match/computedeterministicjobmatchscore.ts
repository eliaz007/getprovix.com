import { normalizeStringArray } from "@/lib/match-heuristic";
import {
  resolveJobWorkType,
  type JobWorkType,
} from "@/lib/jobs";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  normalizeMatchReasons,
  scoreToFitVerdict,
  type OpportunityMatchResult,
} from "@/lib/opportunity-match";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  filterTechnicalRequirements,
  isSoftOrTenureRequirement,
} from "@/lib/technical-skill-requirements";
export { filterTechnicalRequirements, isSoftOrTenureRequirement };
import { computeAuditScoreBonus } from "./computeauditscorebonus";

/**
 * Final match % is TypeScript-only: technical requirement overlap + experience
 * bump + bounded audit bonus. Never trust an LLM for this number.
 */
export function computeDeterministicJobMatchScore(options: {
  overlappingCount: number;
  missingCount: number;
  experienceTier: string;
  auditScore: number | null | undefined;
}): number {
  const requirementCount = options.overlappingCount + options.missingCount;
  let matchScore = 0;

  if (requirementCount === 0) {
    matchScore = options.experienceTier.trim() ? 35 : 20;
  } else {
    matchScore = Math.round(
      (options.overlappingCount / requirementCount) * 80
    );
  }

  if (options.experienceTier.trim()) {
    matchScore += 8;
  }

  matchScore += computeAuditScoreBonus(options.auditScore);

  return clampScore0to100(matchScore);
}
