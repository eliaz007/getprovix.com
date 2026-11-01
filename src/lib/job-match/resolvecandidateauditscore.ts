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

export function resolveCandidateAuditScore(
  candidate: JobMatchCandidatePayload | null | undefined
): number | null {
  for (const value of [candidate?.auditScore, candidate?.productionScore]) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.round(value);
    }
  }
  return null;
}
