export type MatchCandidatePayload = {
  title?: string;
  bio?: string;
  skills?: string[] | string;
  degree?: string;
};

export type MatchJobPayload = {
  title?: string;
  company?: string;
  tags?: string[] | string;
  location?: string;
};

export type MatchResult = {
  match_percentage: number;
  reasoning: string;
  matching_skills: string[];
  missing_skills: string[];
};

export function clampMatchPercentage(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return 65;
  }

  return Math.min(99, Math.max(50, Math.round(numeric)));
}

export function normalizeStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeMatchResult(raw: unknown): MatchResult {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const scoreSource = record.score ?? record.match_percentage;
  const breakdownSource = record.breakdown ?? record.reasoning;

  const reasoning =
    typeof breakdownSource === "string" && breakdownSource.trim()
      ? breakdownSource.trim()
      : "Your profile partially aligns with this role's requirements.";

  return {
    match_percentage: clampMatchPercentage(scoreSource),
    reasoning,
    matching_skills: normalizeStringArray(record.matching_skills),
    missing_skills: normalizeStringArray(record.missing_skills),
  };
}

export function buildFallbackMatch(
  candidate: MatchCandidatePayload,
  job: MatchJobPayload
): MatchResult {
  const candidateSkills = normalizeStringArray(candidate.skills);
  const jobTags = normalizeStringArray(job.tags);

  const normalizedCandidateSkills = candidateSkills.map((skill) =>
    skill.toLowerCase()
  );

  const matching_skills = jobTags.filter((tag) =>
    normalizedCandidateSkills.some(
      (skill) =>
        skill.includes(tag.toLowerCase()) || tag.toLowerCase().includes(skill)
    )
  );

  const missing_skills = jobTags.filter(
    (tag) => !matching_skills.includes(tag)
  );

  const overlapRatio =
    jobTags.length > 0 ? matching_skills.length / jobTags.length : 0.5;

  const match_percentage = clampMatchPercentage(
    50 + Math.round(overlapRatio * 49)
  );

  const reasoning =
    matching_skills.length > 0
      ? `You're a strong fit for ${job.title ?? "this role"} with your ${matching_skills.join(", ")} experience.`
      : `Your profile currently has limited overlap with the required skills for ${job.title ?? "this role"}.`;

  return {
    match_percentage,
    reasoning,
    matching_skills,
    missing_skills,
  };
}
