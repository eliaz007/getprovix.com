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
import type { AuditBreakdownSignals } from "./auditbreakdownsignals";
import type { GithubAuditSummary } from "./githubauditsummary";

/** Grounded evidence the candidate-facing match LLM may cite. */
export type VerifiedMatchContext = {
  verifiedTechnologies: string[];
  auditScore: number | null;
  github: GithubAuditSummary | null;
  productionSignals: AuditBreakdownSignals & {
    hasCiSignal: boolean;
    hasTestSignal: boolean;
  };
};
