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
import type { JobMatchJobPayload } from "./jobmatchjobpayload";
import { resolveCandidateAvailability } from "./resolvecandidateavailability";
import { workTypeLabel } from "./worktypelabel";

/**
 * Narrow jobs to those compatible with the candidate's availability flags
 * and optional active opportunities tab (preferredWorkType).
 */
export function filterJobsForAvailabilityMatch<T extends JobMatchJobPayload>(
  jobs: T[],
  candidate: JobMatchCandidatePayload | null | undefined,
  preferredWorkType?: JobWorkType | null
): { jobs: T[]; error: string | null } {
  const { openToFulltime, openToContract } =
    resolveCandidateAvailability(candidate);

  if (!openToFulltime && !openToContract) {
    return {
      jobs: [],
      error:
        "Update Availability & Work Preferences to open full-time or contract roles before running AI Match.",
    };
  }

  const preferred =
    preferredWorkType ?? candidate?.preferredWorkType ?? null;

  if (preferred === "fulltime" && !openToFulltime) {
    return {
      jobs: [],
      error:
        "You're viewing Full-Time roles, but your profile is only open to contract work. Switch to the Contract tab or update Availability preferences.",
    };
  }

  if (preferred === "contract" && !openToContract) {
    return {
      jobs: [],
      error:
        "You're viewing Contract roles, but your profile is only open to full-time work. Switch to the Full-Time tab or update Availability preferences.",
    };
  }

  const allowed = new Set<JobWorkType>();
  if (preferred) {
    allowed.add(preferred);
  } else {
    if (openToFulltime) allowed.add("fulltime");
    if (openToContract) allowed.add("contract");
  }

  const filtered = jobs.filter((job: (typeof jobs)[number]) =>
    allowed.has(
      job.workType ??
        resolveJobWorkType({
          employment_type: job.employment_type ?? job.employmentType,
          title: typeof job.title === "string" ? job.title : "",
          description:
            typeof job.description === "string" ? job.description : "",
          tags: normalizeStringArray(job.tags),
          tech_stack: normalizeStringArray(job.techStack ?? job.tech_stack),
          required_skills: normalizeStringArray(
            job.requiredSkills ?? job.required_skills
          ),
        })
    )
  );

  if (filtered.length === 0) {
    const mode =
      preferred ??
      (openToContract && !openToFulltime
        ? "contract"
        : openToFulltime && !openToContract
          ? "fulltime"
          : null);
    return {
      jobs: [],
      error: mode
        ? `No active ${workTypeLabel(mode)} openings match your availability right now.`
        : "No active openings match your availability preferences right now.",
    };
  }

  return { jobs: filtered, error: null };
}
