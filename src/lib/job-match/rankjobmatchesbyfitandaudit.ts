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
import type { JobMatchCandidatePayload } from "./jobmatchcandidatepayload";
import type { JobMatch } from "./jobmatch";
import { computeDeterministicJobMatchScore } from "./computedeterministicjobmatchscore";

/**
 * Sort matches by deterministic fit score (already includes bounded audit bonus).
 * Does not mutate scores — audit boost is applied only in computeDeterministicJobMatchScore.
 */
export function rankJobMatchesByFitAndAudit(
  matches: JobMatch[],
  _candidate?: JobMatchCandidatePayload | null
): JobMatch[] {
  return [...matches].sort((left, right) => {
    if (right.matchScore !== left.matchScore) {
      return right.matchScore - left.matchScore;
    }
    return String(left.jobId).localeCompare(String(right.jobId));
  });
}
