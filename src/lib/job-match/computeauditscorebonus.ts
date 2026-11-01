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

/** Bounded 0–8 bonus from verified production audit score. */
export function computeAuditScoreBonus(auditScore: number | null | undefined): number {
  if (typeof auditScore !== "number" || !Number.isFinite(auditScore)) {
    return 0;
  }
  return Math.min(8, Math.max(0, Math.round((auditScore / 100) * 8)));
}
