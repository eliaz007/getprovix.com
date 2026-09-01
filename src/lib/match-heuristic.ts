import { clampScore0to100 } from "@/lib/score-scale";

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
  tech_stack?: string[] | string;
  techStack?: string[] | string;
  required_skills?: string[] | string;
  requiredSkills?: string[] | string;
  location?: string;
  description?: string;
  searchQuery?: string;
};

export type MatchResult = {
  match_percentage: number;
  reasoning: string;
  matching_skills: string[];
  missing_skills: string[];
};

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "job",
  "of",
  "on",
  "or",
  "our",
  "role",
  "the",
  "this",
  "to",
  "we",
  "with",
  "you",
  "your",
]);

const TECH_ALIASES: Record<string, string[]> = {
  js: ["javascript"],
  javascript: ["js"],
  ts: ["typescript"],
  typescript: ["ts"],
  react: ["reactjs", "react.js"],
  reactjs: ["react"],
  node: ["nodejs", "node.js"],
  nodejs: ["node"],
  next: ["nextjs", "next.js"],
  nextjs: ["next"],
  py: ["python"],
  python: ["py"],
  postgres: ["postgresql", "sql"],
  postgresql: ["postgres", "sql"],
  ml: ["machinelearning", "ai"],
  ai: ["ml"],
};

export function clampMatchPercentage(value: unknown): number {
  return clampScore0to100(value, 0);
}

export function isCannedMatchScore(score: number): boolean {
  return score === 50 || score === 65 || score === 94;
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

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#]+/g)
    .map((token) => token.replace(/^\.+|\.+$/g, ""))
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function expandToken(token: string): Set<string> {
  const expanded = new Set<string>([token]);
  for (const alias of TECH_ALIASES[token] ?? []) {
    expanded.add(alias);
  }
  return expanded;
}

function tokenMatches(candidateToken: string, requirementToken: string): boolean {
  if (candidateToken === requirementToken) {
    return true;
  }

  const candidateExpanded = expandToken(candidateToken);
  const requirementExpanded = expandToken(requirementToken);

  for (const left of candidateExpanded) {
    for (const right of requirementExpanded) {
      if (left === right) {
        return true;
      }
      if (left.length >= 3 && right.length >= 3 && (left.includes(right) || right.includes(left))) {
        return true;
      }
    }
  }

  return false;
}

function uniqueNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value.trim());
  }

  return result;
}

function jobRequirementLists(job: MatchJobPayload): string[] {
  return uniqueNormalized([
    ...normalizeStringArray(job.techStack ?? job.tech_stack),
    ...normalizeStringArray(job.requiredSkills ?? job.required_skills),
    ...normalizeStringArray(job.tags),
  ]);
}

function buildRequirementTokens(job: MatchJobPayload): string[] {
  const requirements = jobRequirementLists(job);
  const primary = uniqueNormalized(
    tokenize(
      [job.title ?? "", job.searchQuery ?? "", requirements.join(" ")].join(" ")
    )
  );
  const descriptionTokens = uniqueNormalized(
    tokenize(job.description ?? "").filter((token) => token.length >= 4)
  ).slice(0, 12);

  return uniqueNormalized([...primary, ...descriptionTokens]);
}

function findMatchingSkills(
  candidateSkills: string[],
  requirementTokens: string[],
  jobText: string
): string[] {
  return candidateSkills.filter((skill) => {
    const skillTokens = tokenize(skill);
    if (skillTokens.length === 0) {
      return jobText.includes(skill.toLowerCase());
    }

    return skillTokens.some((skillToken) =>
      requirementTokens.some((requirement) => tokenMatches(skillToken, requirement))
    );
  });
}

/**
 * Lightweight talent-pool scorer: candidate skills/bio/title vs job description,
 * tags, and the employer's live search query. Returns 0-100, never a canned 50.
 */
export function scoreTalentMatch(
  candidate: MatchCandidatePayload,
  job: MatchJobPayload
): MatchResult {
  const candidateSkills = uniqueNormalized(normalizeStringArray(candidate.skills));
  const title = candidate.title?.trim() ?? "";
  const bio = candidate.bio?.trim() ?? "";
  const degree = candidate.degree?.trim() ?? "";
  const searchQuery = job.searchQuery?.trim() ?? "";
  const jobTitle = job.title?.trim() ?? "";
  const jobDescription = job.description?.trim() ?? "";
  const jobTags = jobRequirementLists(job);

  const candidateTokens = uniqueNormalized(
    tokenize([title, bio, degree, candidateSkills.join(" ")].join(" "))
  );
  const requirementTokens = buildRequirementTokens(job);
  const jobText = [
    jobTitle,
    job.company ?? "",
    job.location ?? "",
    jobDescription,
    searchQuery,
    jobTags.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  const matching_skills = findMatchingSkills(
    candidateSkills,
    requirementTokens,
    jobText
  );

  const missing_skills = jobTags.filter(
    (tag) =>
      !matching_skills.some(
        (skill) =>
          skill.toLowerCase() === tag.toLowerCase() ||
          tokenMatches(skill.toLowerCase(), tag.toLowerCase())
      )
  );

  const hasJobSignal = requirementTokens.length > 0;
  let match_percentage = 0;

  if (hasJobSignal) {
    const overlap =
      requirementTokens.length === 0
        ? 0
        : requirementTokens.filter((requirement) =>
            candidateTokens.some((token) => tokenMatches(token, requirement))
          ).length / requirementTokens.length;

    const skillOverlap =
      jobTags.length > 0
        ? matching_skills.length / jobTags.length
        : candidateSkills.length > 0
          ? Math.min(1, matching_skills.length / Math.max(candidateSkills.length, 1))
          : overlap;

    const titleOverlap =
      title && jobTitle
        ? tokenize(title).some((token) =>
            tokenize(jobTitle).some((jobToken) => tokenMatches(token, jobToken))
          )
          ? 1
          : 0.15
        : 0;

    const query = searchQuery.toLowerCase();
    const queryHit =
      query.length >= 2 &&
      [title, bio, degree, candidateSkills.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(query)
        ? 1
        : query
            .split(/\s+/)
            .filter((part) => part.length >= 2)
            .some((part) =>
              candidateTokens.some((token) => tokenMatches(token, part))
            )
          ? 0.7
          : 0;

    match_percentage =
      Math.round(skillOverlap * 50) +
      Math.round(overlap * 25) +
      Math.round(titleOverlap * 15) +
      Math.round(queryHit * 10);
  } else {
    const skillDepth = Math.min(candidateSkills.length, 8) * 6;
    const bioSignal = Math.min(18, Math.round(bio.length / 40));
    const titleSignal = title ? 10 : 0;
    const degreeSignal = degree ? 6 : 0;
    match_percentage = skillDepth + bioSignal + titleSignal + degreeSignal;
  }

  match_percentage = clampMatchPercentage(match_percentage);

  const roleLabel = jobTitle || (searchQuery ? `"${searchQuery}"` : "this search");
  const reasoning =
    matching_skills.length > 0
      ? `Strong overlap on ${matching_skills.slice(0, 3).join(", ")} for ${roleLabel}.`
      : hasJobSignal
        ? `Limited skill overlap with ${roleLabel} based on the current profile.`
        : "No active job or search query yet — score reflects profile depth only.";

  return {
    match_percentage,
    reasoning,
    matching_skills,
    missing_skills,
  };
}

export function normalizeMatchResult(raw: unknown): MatchResult {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const scoreSource = record.score ?? record.match_percentage;
  const breakdownSource = record.breakdown ?? record.reasoning;

  const reasoning =
    typeof breakdownSource === "string" && breakdownSource.trim()
      ? breakdownSource.trim()
      : "Profile partially aligns with this role's requirements.";

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
  return scoreTalentMatch(candidate, job);
}
