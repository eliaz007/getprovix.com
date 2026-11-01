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

export function preserveJobIdType(
  rawId: unknown,
  originalId: string | number
): string | number {
  if (typeof originalId === "number") {
    const numeric =
      typeof rawId === "number"
        ? rawId
        : typeof rawId === "string"
          ? Number.parseInt(rawId, 10)
          : Number.NaN;
    return Number.isFinite(numeric) ? numeric : originalId;
  }

  if (typeof rawId === "string" && rawId.trim()) {
    return rawId.trim();
  }

  if (typeof rawId === "number" && Number.isFinite(rawId)) {
    return String(rawId);
  }

  return originalId;
}
