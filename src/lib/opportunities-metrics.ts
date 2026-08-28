import { normalizeStringArray } from "@/lib/match-heuristic";

export function normalizeJobStatus(status: string | null | undefined): string {
  return (status ?? "active").trim().toLowerCase();
}

export function isActiveJob(job: { status?: string | null }): boolean {
  return normalizeJobStatus(job.status) === "active";
}

export function getActiveJobs<T extends { status?: string | null }>(
  jobs: T[]
): T[] {
  return jobs.filter(isActiveJob);
}

export function countActiveOpenings(
  jobs: Array<{ status?: string | null }>
): number {
  return getActiveJobs(jobs).length;
}

export function skillsOverlap(
  candidateSkills: string[],
  jobTags: string[]
): boolean {
  const normalizedCandidate = normalizeStringArray(candidateSkills).map((skill) =>
    skill.toLowerCase()
  );
  const normalizedTags = normalizeStringArray(jobTags).map((tag) =>
    tag.toLowerCase()
  );

  if (normalizedCandidate.length === 0 || normalizedTags.length === 0) {
    return false;
  }

  return normalizedTags.some((tag) =>
    normalizedCandidate.some(
      (skill) => skill.includes(tag) || tag.includes(skill)
    )
  );
}

export function countJobsMatchingCandidateSkills(
  jobs: Array<{ status?: string | null; tags?: string[] | null }>,
  candidateSkills: string[] | string
): number {
  const skills = normalizeStringArray(candidateSkills);

  return getActiveJobs(jobs).filter((job) =>
    skillsOverlap(skills, normalizeStringArray(job.tags))
  ).length;
}

export function coerceVisibilityFlag(value: unknown): boolean {
  if (value === true || value === 1) {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === "true" ||
      normalized === "t" ||
      normalized === "1" ||
      normalized === "yes"
    );
  }

  return false;
}

export function isVisibleToEmployers(
  visibleToEmployers: unknown
): boolean {
  return coerceVisibilityFlag(visibleToEmployers);
}

export function profileRowIsPublicToEmployers(row: {
  is_visible_in_pool?: unknown;
  visible_to_employers?: unknown;
}): boolean {
  if (row.is_visible_in_pool != null) {
    return coerceVisibilityFlag(row.is_visible_in_pool);
  }

  if (row.visible_to_employers != null) {
    return coerceVisibilityFlag(row.visible_to_employers);
  }

  return false;
}
