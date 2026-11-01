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

export function parseExperienceTier(
  candidate: JobMatchCandidatePayload
): string {
  return (
    candidate.experienceTier?.trim() ||
    candidate.experience_level?.trim() ||
    candidate.experience?.trim() ||
    ""
  );
}
