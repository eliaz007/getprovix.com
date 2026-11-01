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

export type JobMatchCandidatePayload = {
  skills?: string[] | string;
  experienceTier?: string;
  experience_level?: string;
  experience?: string;
  githubUrl?: string;
  github_url?: string;
  githubAudit?: unknown;
  /** Production audit pillar scores + audited repo metadata from profiles.audit_breakdown. */
  auditBreakdown?: unknown;
  openToFulltime?: boolean;
  open_to_fulltime?: boolean;
  openToContract?: boolean;
  open_to_contract?: boolean;
  auditScore?: number | null;
  productionScore?: number | null;
  preferredWorkType?: JobWorkType;
};
