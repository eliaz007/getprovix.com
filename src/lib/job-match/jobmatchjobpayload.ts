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

export type JobMatchJobPayload = {
  jobId?: string | number;
  id?: string | number;
  title?: string;
  company?: string;
  techStack?: string[] | string;
  tech_stack?: string[] | string;
  requiredSkills?: string[] | string;
  required_skills?: string[] | string;
  skills?: string[] | string;
  tags?: string[] | string;
  description?: string;
  employment_type?: string | null;
  employmentType?: string | null;
  workType?: JobWorkType;
};
