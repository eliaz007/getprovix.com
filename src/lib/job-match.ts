import { normalizeStringArray } from "@/lib/match-heuristic";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  normalizeMatchReasons,
  scoreToFitVerdict,
  type OpportunityMatchResult,
} from "@/lib/opportunity-match";
import { clampScore0to100 } from "@/lib/score-scale";

export const INSUFFICIENT_DATA_REASON = "Insufficient data";

export type JobMatchCandidatePayload = {
  skills?: string[] | string;
  experienceTier?: string;
  experience_level?: string;
  experience?: string;
  githubUrl?: string;
  github_url?: string;
  githubAudit?: unknown;
};

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
};

export type JobMatch = {
  jobId: string | number;
  matchScore: number;
  matchingReason: string;
  matchReasons: string[];
};

export type GithubAuditSummary = {
  owner: string;
  repo: string;
  language: string | null;
  stars: number | null;
  commit_count_sampled: number;
};

export type JobMatchResult = {
  matches: JobMatch[];
};

export type ParsedJobListing = {
  jobId: string | number;
  title: string;
  company: string;
  techStack: string[];
  requiredSkills: string[];
  description: string;
};

const MAX_JOBS_PER_REQUEST = 40;

export function parseJobId(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const numeric = Number.parseInt(trimmed, 10);
      return Number.isFinite(numeric) ? numeric : trimmed;
    }
    return trimmed;
  }

  return null;
}

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

export function parseExperienceTier(
  candidate: JobMatchCandidatePayload
): string {
  return (
    candidate.experienceTier?.trim() ||
    candidate.experience_level?.trim() ||
    candidate.experience?.trim() ||
    ""
  );
}

function collectAuditSkills(audit: unknown): string[] {
  if (!audit || typeof audit !== "object") {
    return [];
  }

  const record = audit as Record<string, unknown>;
  const skills = [
    ...normalizeStringArray(record.skills),
    ...normalizeStringArray(record.languages),
    ...normalizeStringArray(record.tech_stack),
  ];

  if (typeof record.language === "string" && record.language.trim()) {
    skills.push(record.language.trim());
  }

  if (Array.isArray(record.artifacts)) {
    for (const artifact of record.artifacts) {
      skills.push(...collectAuditSkills(artifact));
    }
  }

  return skills;
}

export function extractAuditedSkills(
  candidate: JobMatchCandidatePayload
): string[] {
  const fromProfile = normalizeStringArray(candidate.skills);
  const fromAudit = collectAuditSkills(candidate.githubAudit);
  const unique = new Set<string>();

  for (const skill of [...fromProfile, ...fromAudit]) {
    const trimmed = skill.trim();
    if (trimmed) {
      unique.add(trimmed);
    }
  }

  return [...unique];
}

export function hasUsableCandidateMatchData(
  candidate: JobMatchCandidatePayload | null | undefined
): boolean {
  if (!candidate) {
    return false;
  }

  return extractAuditedSkills(candidate).length > 0;
}

const GENERIC_MATCH_REASON =
  /verified profile signals align|partially overlap with this role|sharpen match accuracy|limited overlap with this role's required stack|few explicit skill requirements|align with parts of this role|supports your proof-of-work claims/i;

function isGenericMatchReason(reason: string): boolean {
  return GENERIC_MATCH_REASON.test(reason);
}

function formatSkillList(items: string[]): string {
  if (items.length === 0) {
    return "listed requirements";
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function uniqueDisplayList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function skillOverlapsRequirement(skill: string, requirement: string): boolean {
  const left = skill.toLowerCase();
  const right = requirement.toLowerCase();
  return (
    left === right ||
    (left.length >= 3 && right.length >= 3 && (left.includes(right) || right.includes(left)))
  );
}

export function summarizeGithubAudit(audit: unknown): GithubAuditSummary | null {
  if (!audit || typeof audit !== "object") {
    return null;
  }

  const record = audit as Record<string, unknown>;

  if (record.github_audit && typeof record.github_audit === "object") {
    return summarizeGithubAudit(record.github_audit);
  }

  if (Array.isArray(record.artifacts)) {
    for (const artifact of record.artifacts) {
      const nested = summarizeGithubAudit(artifact);
      if (nested) {
        return nested;
      }
    }
  }

  const owner = typeof record.owner === "string" ? record.owner.trim() : "";
  const repo = typeof record.repo === "string" ? record.repo.trim() : "";
  const language =
    typeof record.language === "string" && record.language.trim()
      ? record.language.trim()
      : null;
  const commitCount =
    typeof record.commit_count_sampled === "number"
      ? record.commit_count_sampled
      : 0;

  if (!owner && !repo && !language) {
    return null;
  }

  return {
    owner,
    repo,
    language,
    stars: typeof record.stars === "number" ? record.stars : null,
    commit_count_sampled: commitCount,
  };
}

export function computeJobSkillOverlap(
  skills: string[],
  job: ParsedJobListing
): { overlapping: string[]; missing: string[] } {
  const requirements = uniqueDisplayList([...job.techStack, ...job.requiredSkills]);
  const overlapping = requirements.filter((required) =>
    skills.some((skill) => skillOverlapsRequirement(skill, required))
  );
  const missing = requirements.filter(
    (required) =>
      !overlapping.some((skill) => skillOverlapsRequirement(skill, required))
  );

  return { overlapping, missing };
}

function jobMatchFromReasons(
  jobId: string | number,
  matchScore: number,
  reasons: string[]
): JobMatch {
  const matchReasons =
    reasons.map((reason) => reason.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 3);
  const matchingReason = matchReasons[0] ?? INSUFFICIENT_DATA_REASON;

  return {
    jobId,
    matchScore: clampScore0to100(matchScore),
    matchingReason,
    matchReasons: matchReasons.length > 0 ? matchReasons : [INSUFFICIENT_DATA_REASON],
  };
}

function mergeMatchReasons(
  aiReasons: string[],
  heuristicReasons: string[]
): string[] {
  const specificAi = aiReasons
    .map((reason) => reason.replace(/\s+/g, " ").trim())
    .filter(
      (reason) =>
        reason &&
        reason !== INSUFFICIENT_DATA_REASON &&
        !isGenericMatchReason(reason)
    );
  const specificHeuristic = heuristicReasons
    .map((reason) => reason.replace(/\s+/g, " ").trim())
    .filter((reason) => reason && reason !== INSUFFICIENT_DATA_REASON);

  const merged: string[] = [];
  const seen = new Set<string>();

  for (const reason of [...specificAi, ...specificHeuristic]) {
    const key = reason.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(reason);
    if (merged.length >= 3) {
      break;
    }
  }

  if (merged.length > 0) {
    return merged;
  }

  return specificHeuristic.slice(0, 3);
}

export function buildHeuristicMatchReasons(
  skills: string[],
  experienceTier: string,
  job: ParsedJobListing,
  githubAudit?: unknown
): string[] {
  const { overlapping, missing } = computeJobSkillOverlap(skills, job);
  const github = summarizeGithubAudit(githubAudit);
  const reasons: string[] = [];
  const roleLabel = job.title.trim() || "this role";

  if (overlapping.length > 0) {
    reasons.push(
      `Your ${formatSkillList(overlapping.slice(0, 3))} skills match ${roleLabel}'s required stack.`
    );
  }

  if (missing.length > 0) {
    reasons.push(
      `This listing also asks for ${formatSkillList(missing.slice(0, 3))}, which are not in your audited skills.`
    );
  }

  if (github) {
    const repoLabel =
      github.owner && github.repo
        ? `${github.owner}/${github.repo}`
        : github.owner || "your GitHub";

    if (
      github.language &&
      [...overlapping, ...missing].some((item) =>
        skillOverlapsRequirement(item, github.language!)
      )
    ) {
      if (overlapping.some((item) => skillOverlapsRequirement(item, github.language!))) {
        reasons.push(
          `GitHub repo ${repoLabel} is primarily ${github.language}, which this role lists as a requirement.`
        );
      } else {
        reasons.push(
          `GitHub repo ${repoLabel} is centered on ${github.language}, while this role emphasizes ${formatSkillList(missing.slice(0, 2))}.`
        );
      }
    } else if (github.commit_count_sampled >= 3) {
      reasons.push(
        `GitHub shows ${github.commit_count_sampled} recent commits on ${repoLabel} as proof of work.`
      );
    } else if (github.language) {
      reasons.push(
        `Your GitHub work on ${repoLabel} is primarily ${github.language}.`
      );
    }
  }

  if (experienceTier && reasons.length < 3) {
    reasons.push(
      `Your ${experienceTier} experience level is being scored against ${roleLabel}.`
    );
  }

  if (reasons.length === 0 && skills.length > 0) {
    reasons.push(
      job.requiredSkills.length === 0 && job.techStack.length === 0
        ? `Your profile highlights ${formatSkillList(skills.slice(0, 3))} against ${roleLabel}, which lists no explicit required skills.`
        : `Your audited skills (${formatSkillList(skills.slice(0, 3))}) do not overlap ${roleLabel}'s listed requirements.`
    );
  }

  return uniqueDisplayList(reasons).slice(0, 3);
}

export function parseJobListings(jobs: unknown): ParsedJobListing[] {
  if (!Array.isArray(jobs)) {
    return [];
  }

  const listings: ParsedJobListing[] = [];

  for (const job of jobs.slice(0, MAX_JOBS_PER_REQUEST)) {
    if (!job || typeof job !== "object") {
      continue;
    }

    const record = job as JobMatchJobPayload;
    const jobId = parseJobId(record.jobId ?? record.id);
    if (jobId === null) {
      continue;
    }

    const requiredSkills = normalizeStringArray(
      record.requiredSkills ??
        record.required_skills ??
        record.skills ??
        record.tags
    );
    const techStack = normalizeStringArray(
      record.techStack ?? record.tech_stack
    );

    listings.push({
      jobId,
      title: typeof record.title === "string" ? record.title.trim() : "",
      company: typeof record.company === "string" ? record.company.trim() : "",
      techStack,
      requiredSkills,
      description:
        typeof record.description === "string"
          ? record.description.slice(0, 800)
          : "",
    });
  }

  return listings;
}

export function normalizeMatchingReason(
  value: unknown,
  fallback = INSUFFICIENT_DATA_REASON
): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const text = value.replace(/\s+/g, " ").trim();
  if (!text) {
    return fallback;
  }

  const firstSentenceMatch = /^.*?[.!?](?=\s|$)/.exec(text);
  const firstSentence = (firstSentenceMatch?.[0] ?? text).trim();
  return firstSentence.slice(0, 280);
}

function parseRawMatchReasons(record: Record<string, unknown>): string[] {
  const fromArray = normalizeStringArray(
    record.matchingReasons ?? record.match_reasons ?? record.matching_reasons
  );
  if (fromArray.length > 0) {
    return fromArray
      .map((reason) => normalizeMatchingReason(reason, ""))
      .filter(Boolean);
  }

  const single = normalizeMatchingReason(
    record.matchingReason ?? record.matching_reason ?? record.reason,
    ""
  );
  return single ? [single] : [];
}

export function normalizeJobMatch(
  raw: unknown,
  fallbackJobId: string | number
): JobMatch {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const matchReasons = parseRawMatchReasons(record);

  return jobMatchFromReasons(
    preserveJobIdType(record.jobId ?? record.job_id, fallbackJobId),
    clampScore0to100(
      record.matchScore ?? record.match_score ?? record.score
    ),
    matchReasons
  );
}

export function buildInsufficientDataMatches(
  jobs: ParsedJobListing[]
): JobMatch[] {
  return jobs.map((job) =>
    jobMatchFromReasons(job.jobId, 0, [INSUFFICIENT_DATA_REASON])
  );
}

export function buildHeuristicJobMatch(
  skills: string[],
  experienceTier: string,
  job: ParsedJobListing,
  githubAudit?: unknown
): JobMatch {
  if (skills.length === 0) {
    return jobMatchFromReasons(job.jobId, 0, [INSUFFICIENT_DATA_REASON]);
  }

  const { overlapping, missing } = computeJobSkillOverlap(skills, job);
  const requirementCount = overlapping.length + missing.length;

  let matchScore = 0;
  if (requirementCount === 0) {
    matchScore = experienceTier ? 35 : 20;
  } else {
    matchScore = Math.round((overlapping.length / requirementCount) * 80);
  }

  if (experienceTier) {
    matchScore = Math.min(100, matchScore + 8);
  }

  return jobMatchFromReasons(
    job.jobId,
    matchScore,
    buildHeuristicMatchReasons(skills, experienceTier, job, githubAudit)
  );
}

export function buildFallbackMatches(
  candidate: JobMatchCandidatePayload | null | undefined,
  jobs: ParsedJobListing[]
): JobMatch[] {
  if (!hasUsableCandidateMatchData(candidate)) {
    return buildInsufficientDataMatches(jobs);
  }

  const skills = extractAuditedSkills(candidate!);
  const experienceTier = parseExperienceTier(candidate!);
  return jobs.map((job) =>
    buildHeuristicJobMatch(skills, experienceTier, job, candidate?.githubAudit)
  );
}

export function alignMatchesToJobs(
  matches: JobMatch[],
  jobs: ParsedJobListing[],
  candidate: JobMatchCandidatePayload
): JobMatch[] {
  const byId = new Map(matches.map((match) => [String(match.jobId), match]));
  const skills = extractAuditedSkills(candidate);
  const experienceTier = parseExperienceTier(candidate);

  return jobs.map((job) => {
    const heuristic = buildHeuristicJobMatch(
      skills,
      experienceTier,
      job,
      candidate.githubAudit
    );
    const existing = byId.get(String(job.jobId));
    if (!existing) {
      return heuristic;
    }

    const mergedReasons = mergeMatchReasons(
      existing.matchReasons.length > 0
        ? existing.matchReasons
        : [existing.matchingReason],
      heuristic.matchReasons
    );

    return jobMatchFromReasons(
      job.jobId,
      existing.matchScore,
      mergedReasons.length > 0 ? mergedReasons : heuristic.matchReasons
    );
  });
}

export function normalizeJobMatchResult(
  raw: unknown,
  jobs: ParsedJobListing[],
  candidate: JobMatchCandidatePayload
): JobMatchResult {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(record.matches)
    ? record.matches
    : Array.isArray(raw)
      ? raw
      : [];

  const matches = list
    .map((item, index) =>
      normalizeJobMatch(item, jobs[index]?.jobId ?? index)
    )
    .filter((item) => parseJobId(item.jobId) !== null);

  return {
    matches: alignMatchesToJobs(matches, jobs, candidate),
  };
}

export function toOpportunityMatchInsight(
  match: JobMatch
): OpportunityMatchResult {
  const reasons =
    match.matchReasons.length > 0
      ? match.matchReasons
      : [match.matchingReason];

  return {
    match_score: match.matchScore,
    fit_verdict: scoreToFitVerdict(match.matchScore),
    match_reasons: normalizeMatchReasons(reasons),
  };
}

export function isGeminiRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return /429|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(String(error));
  }

  const record = error as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
  };
  const status = Number(record.status ?? record.code);
  const message = `${record.message ?? ""} ${String(error)}`;

  return (
    status === 429 ||
    /429|RESOURCE_EXHAUSTED|rate.?limit|quota exceeded/i.test(message)
  );
}

export function readRetryAfterSeconds(error: unknown, fallback = 30): number {
  if (error && typeof error === "object") {
    const record = error as { retryAfter?: unknown; retryDelay?: unknown };
    const retryAfter = Number(record.retryAfter ?? record.retryDelay);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return Math.min(120, Math.max(1, Math.round(retryAfter)));
    }
  }

  return fallback;
}

export async function fetchJobMatches(
  candidate: JobMatchCandidatePayload,
  jobs: JobMatchJobPayload[]
): Promise<JobMatchResult> {
  const listings = parseJobListings(jobs);

  try {
    const response = await fetch("/api/match-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate, jobs }),
      signal: AbortSignal.timeout(45_000),
    });

    const raw = (await readJsonResponse(response).catch(() => null)) as unknown;
    if (raw && typeof raw === "object") {
      const normalized = normalizeJobMatchResult(raw, listings, candidate);
      if (normalized.matches.length > 0 || listings.length === 0) {
        return normalized;
      }
    }

    return { matches: buildFallbackMatches(candidate, listings) };
  } catch (error) {
    console.warn("Job match API unavailable, using fallback.", error);
    return { matches: buildFallbackMatches(candidate, listings) };
  }
}
