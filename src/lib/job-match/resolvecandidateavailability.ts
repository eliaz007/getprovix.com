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
import type { CandidateAvailabilityPreferences } from "./candidateavailabilitypreferences";

export function resolveCandidateAvailability(
  candidate: JobMatchCandidatePayload | null | undefined
): CandidateAvailabilityPreferences {
  return {
    openToFulltime:
      candidate?.openToFulltime === true ||
      candidate?.open_to_fulltime === true,
    openToContract:
      candidate?.openToContract === true ||
      candidate?.open_to_contract === true,
  };
}
