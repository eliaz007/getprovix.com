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

export function isVisibleToEmployers(
  visibleToEmployers: boolean | null | undefined
): boolean {
  return visibleToEmployers === true;
}
