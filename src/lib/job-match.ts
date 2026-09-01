import { normalizeStringArray } from "@/lib/match-heuristic";
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
  requiredSkills?: string[] | string;
  skills?: string[] | string;
  tags?: string[] | string;
  description?: string;
};

export type JobMatch = {
  jobId: string | number;
  matchScore: number;
  matchingReason: string;
};

export type JobMatchResult = {
  matches: JobMatch[];
};

export type ParsedJobListing = {
  jobId: string | number;
  title: string;
  company: string;
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

    listings.push({
      jobId,
      title: typeof record.title === "string" ? record.title.trim() : "",
      company: typeof record.company === "string" ? record.company.trim() : "",
      requiredSkills: normalizeStringArray(
        record.requiredSkills ?? record.skills ?? record.tags
      ),
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

export function normalizeJobMatch(
  raw: unknown,
  fallbackJobId: string | number
): JobMatch {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    jobId: preserveJobIdType(record.jobId ?? record.job_id, fallbackJobId),
    matchScore: clampScore0to100(
      record.matchScore ?? record.match_score ?? record.score
    ),
    matchingReason: normalizeMatchingReason(
      record.matchingReason ?? record.matching_reason ?? record.reason
    ),
  };
}

export function buildInsufficientDataMatches(
  jobs: ParsedJobListing[]
): JobMatch[] {
  return jobs.map((job) => ({
    jobId: job.jobId,
    matchScore: 0,
    matchingReason: INSUFFICIENT_DATA_REASON,
  }));
}

export function buildHeuristicJobMatch(
  skills: string[],
  experienceTier: string,
  job: ParsedJobListing
): JobMatch {
  if (skills.length === 0) {
    return {
      jobId: job.jobId,
      matchScore: 0,
      matchingReason: INSUFFICIENT_DATA_REASON,
    };
  }

  const normalizedSkills = skills.map((skill) => skill.toLowerCase());
  const overlapping = job.requiredSkills.filter((required) =>
    normalizedSkills.some(
      (skill) =>
        skill.includes(required.toLowerCase()) ||
        required.toLowerCase().includes(skill)
    )
  );

  let matchScore = 0;
  if (job.requiredSkills.length === 0) {
    matchScore = experienceTier ? 35 : 20;
  } else {
    matchScore = Math.round(
      (overlapping.length / job.requiredSkills.length) * 80
    );
  }

  if (experienceTier) {
    matchScore = Math.min(100, matchScore + 8);
  }

  const matchingReason =
    overlapping.length > 0
      ? `Audited skills in ${overlapping.slice(0, 3).join(", ")} align with this role's required stack.`
      : job.requiredSkills.length > 0
        ? "Audited GitHub skills have limited overlap with this role's required stack."
        : "Candidate audit data is present, but this listing has few explicit skill requirements.";

  return {
    jobId: job.jobId,
    matchScore: clampScore0to100(matchScore),
    matchingReason,
  };
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
  return jobs.map((job) => buildHeuristicJobMatch(skills, experienceTier, job));
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
    const existing = byId.get(String(job.jobId));
    if (existing) {
      return {
        ...existing,
        jobId: job.jobId,
        matchScore: clampScore0to100(existing.matchScore),
        matchingReason: normalizeMatchingReason(existing.matchingReason),
      };
    }

    return buildHeuristicJobMatch(skills, experienceTier, job);
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
  return {
    match_score: match.matchScore,
    fit_verdict: scoreToFitVerdict(match.matchScore),
    match_reasons: normalizeMatchReasons([match.matchingReason]),
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

    const raw = (await response.json().catch(() => null)) as unknown;
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
