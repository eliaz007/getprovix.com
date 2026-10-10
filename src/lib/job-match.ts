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

export const INSUFFICIENT_DATA_REASON = "Insufficient data";

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

export type AuditBreakdownSignals = {
  architectureScore: number | null;
  ciCdScore: number | null;
  testDensity: number | null;
  errorHandling: number | null;
  auditedRepoUrl: string | null;
  auditedAt: string | null;
};

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
  workType: JobWorkType;
  employment_type: string;
};

export type CandidateAvailabilityPreferences = {
  openToFulltime: boolean;
  openToContract: boolean;
};

export function resolveCandidateAvailability(
  candidate: JobMatchCandidatePayload | null | undefined
): CandidateAvailabilityPreferences {
  return {
    openToFulltime:
      candidate?.openToFulltime === true ||
      candidate?.open_to_fulltime === true,
    openToContract:
      candidate?.openToContract === true ||
      candidate?.open_to_contract === true,
  };
}

export function resolveCandidateAuditScore(
  candidate: JobMatchCandidatePayload | null | undefined
): number | null {
  for (const value of [candidate?.auditScore, candidate?.productionScore]) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.round(value);
    }
  }
  return null;
}

function workTypeLabel(workType: JobWorkType): "full-time" | "contract" {
  return workType === "contract" ? "contract" : "full-time";
}

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

  const filtered = jobs.filter((job) =>
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

/**
 * Sort matches by deterministic fit score (already includes bounded audit bonus).
 * Does not mutate scores — audit boost is applied only in computeDeterministicJobMatchScore.
 */
export function rankJobMatchesByFitAndAudit(
  matches: JobMatch[],
  _candidate?: JobMatchCandidatePayload | null
): JobMatch[] {
  return [...matches].sort((left, right) => {
    if (right.matchScore !== left.matchScore) {
      return right.matchScore - left.matchScore;
    }
    return String(left.jobId).localeCompare(String(right.jobId));
  });
}

/** Bounded 0–8 bonus from verified production audit score. */
export function computeAuditScoreBonus(auditScore: number | null | undefined): number {
  if (typeof auditScore !== "number" || !Number.isFinite(auditScore)) {
    return 0;
  }
  return Math.min(8, Math.max(0, Math.round((auditScore / 100) * 8)));
}

/**
 * Final match % is TypeScript-only: technical requirement overlap + experience
 * bump + bounded audit bonus. Never trust an LLM for this number.
 */
export function computeDeterministicJobMatchScore(options: {
  overlappingCount: number;
  missingCount: number;
  experienceTier: string;
  auditScore: number | null | undefined;
}): number {
  const requirementCount = options.overlappingCount + options.missingCount;
  let matchScore = 0;

  if (requirementCount === 0) {
    matchScore = options.experienceTier.trim() ? 35 : 20;
  } else {
    matchScore = Math.round(
      (options.overlappingCount / requirementCount) * 80
    );
  }

  if (options.experienceTier.trim()) {
    matchScore += 8;
  }

  matchScore += computeAuditScoreBonus(options.auditScore);

  return clampScore0to100(matchScore);
}

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

const PATH_TECH_HINTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /next\.config/i, label: "Next.js" },
  { pattern: /vite\.config/i, label: "Vite" },
  { pattern: /tailwind\.config/i, label: "Tailwind CSS" },
  { pattern: /prisma\//i, label: "Prisma" },
  { pattern: /supabase/i, label: "Supabase" },
  { pattern: /docker-compose|Dockerfile/i, label: "Docker" },
  { pattern: /\.github\/workflows/i, label: "GitHub Actions" },
  { pattern: /jest\.config|\/__tests__\//i, label: "Jest" },
  { pattern: /vitest/i, label: "Vitest" },
  { pattern: /playwright/i, label: "Playwright" },
  { pattern: /cypress/i, label: "Cypress" },
  { pattern: /tsconfig/i, label: "TypeScript" },
  { pattern: /package\.json/i, label: "Node.js" },
  { pattern: /requirements\.txt|pyproject\.toml/i, label: "Python" },
  { pattern: /Cargo\.toml/i, label: "Rust" },
  { pattern: /go\.mod/i, label: "Go" },
  { pattern: /Gemfile/i, label: "Ruby" },
  { pattern: /pom\.xml|build\.gradle/i, label: "Java" },
  { pattern: /\.tsx?$/i, label: "TypeScript" },
  { pattern: /react/i, label: "React" },
];

function inferTechFromFilesystem(filesystem: unknown): string[] {
  if (!filesystem || typeof filesystem !== "object") {
    return [];
  }

  const record = filesystem as Record<string, unknown>;
  const paths = [
    ...normalizeStringArray(record.sample_paths),
    ...normalizeStringArray(record.test_paths),
    ...normalizeStringArray(record.ci_workflow_paths),
    ...normalizeStringArray(record.architecture_paths),
  ];

  const found: string[] = [];
  for (const path of paths) {
    for (const hint of PATH_TECH_HINTS) {
      if (hint.pattern.test(path)) {
        found.push(hint.label);
      }
    }
  }

  return found;
}

function collectAuditSkills(audit: unknown, depth = 0): string[] {
  if (!audit || typeof audit !== "object" || depth > 6) {
    return [];
  }

  const record = audit as Record<string, unknown>;
  const skills = [
    ...normalizeStringArray(record.skills),
    ...normalizeStringArray(record.languages),
    ...normalizeStringArray(record.tech_stack),
    ...normalizeStringArray(record.frameworks),
    ...normalizeStringArray(record.packages),
  ];

  if (typeof record.language === "string" && record.language.trim()) {
    skills.push(record.language.trim());
  }

  if (record.github_audit) {
    skills.push(...collectAuditSkills(record.github_audit, depth + 1));
  }

  if (record.filesystem) {
    skills.push(...inferTechFromFilesystem(record.filesystem));
    skills.push(...collectAuditSkills(record.filesystem, depth + 1));
  }

  if (Array.isArray(record.artifacts)) {
    for (const artifact of record.artifacts) {
      skills.push(...collectAuditSkills(artifact, depth + 1));
    }
  }

  return skills;
}

export function parseAuditBreakdownSignals(
  breakdown: unknown
): AuditBreakdownSignals {
  if (!breakdown || typeof breakdown !== "object" || Array.isArray(breakdown)) {
    return {
      architectureScore: null,
      ciCdScore: null,
      testDensity: null,
      errorHandling: null,
      auditedRepoUrl: null,
      auditedAt: null,
    };
  }

  const record = breakdown as Record<string, unknown>;
  const asScore = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return clampScore0to100(value);
    }
    return null;
  };

  return {
    architectureScore: asScore(
      record.architecture_score ?? record.architectureScore
    ),
    ciCdScore: asScore(record.ci_cd_score ?? record.ciCdScore),
    testDensity: asScore(record.test_density ?? record.testDensity),
    errorHandling: asScore(record.error_handling ?? record.errorHandling),
    auditedRepoUrl:
      typeof record.audited_repo_url === "string" &&
      record.audited_repo_url.trim()
        ? record.audited_repo_url.trim()
        : typeof record.auditedRepoUrl === "string" &&
            record.auditedRepoUrl.trim()
          ? record.auditedRepoUrl.trim()
          : null,
    auditedAt:
      typeof record.audited_at === "string" && record.audited_at.trim()
        ? record.audited_at.trim()
        : typeof record.auditedAt === "string" && record.auditedAt.trim()
          ? record.auditedAt.trim()
          : null,
  };
}

function filesystemHasCi(audit: unknown): boolean {
  if (!audit || typeof audit !== "object") {
    return false;
  }
  const record = audit as Record<string, unknown>;
  const nested = record.github_audit ?? record.filesystem;
  const fs =
    record.filesystem && typeof record.filesystem === "object"
      ? (record.filesystem as Record<string, unknown>)
      : nested && typeof nested === "object"
        ? ((nested as Record<string, unknown>).filesystem as
            | Record<string, unknown>
            | undefined)
        : undefined;
  if (!fs || typeof fs !== "object") {
    if (record.github_audit) {
      return filesystemHasCi(record.github_audit);
    }
    return false;
  }
  const workflows = normalizeStringArray(fs.ci_workflow_paths);
  return (
    workflows.length > 0 ||
    fs.ci_has_tests === true ||
    fs.ci_has_build === true ||
    fs.ci_has_lint === true
  );
}

function filesystemHasTests(audit: unknown): boolean {
  if (!audit || typeof audit !== "object") {
    return false;
  }
  const record = audit as Record<string, unknown>;
  if (record.github_audit) {
    const nested = filesystemHasTests(record.github_audit);
    if (nested) return true;
  }
  const fs =
    record.filesystem && typeof record.filesystem === "object"
      ? (record.filesystem as Record<string, unknown>)
      : record;
  const testPaths = normalizeStringArray(fs.test_paths);
  const unitCount =
    typeof fs.unit_test_file_count === "number" ? fs.unit_test_file_count : 0;
  return (
    testPaths.length > 0 ||
    unitCount > 0 ||
    fs.ci_has_tests === true ||
    fs.has_e2e_tools === true
  );
}

export function buildVerifiedMatchContext(
  candidate: JobMatchCandidatePayload
): VerifiedMatchContext {
  const verifiedTechnologies = extractAuditedSkills(candidate);
  const auditScore = resolveCandidateAuditScore(candidate);
  const github = summarizeGithubAudit(candidate.githubAudit);
  const breakdown = parseAuditBreakdownSignals(candidate.auditBreakdown);
  const hasCiSignal =
    (breakdown.ciCdScore !== null && breakdown.ciCdScore > 0) ||
    filesystemHasCi(candidate.githubAudit);
  const hasTestSignal =
    (breakdown.testDensity !== null && breakdown.testDensity > 0) ||
    filesystemHasTests(candidate.githubAudit);

  return {
    verifiedTechnologies,
    auditScore,
    github,
    productionSignals: {
      ...breakdown,
      hasCiSignal,
      hasTestSignal,
    },
  };
}

/**
 * Session cache key for candidate-facing job match: skills + audit identity + jobs.
 */
export function buildCandidateJobMatchCacheKey(
  candidate: JobMatchCandidatePayload,
  jobIds: Array<string | number>,
  preferredWorkType?: JobWorkType | null
): string {
  const skills = extractAuditedSkills(candidate)
    .map((skill) => skill.toLowerCase())
    .sort();
  const breakdown = parseAuditBreakdownSignals(candidate.auditBreakdown);
  const github = summarizeGithubAudit(candidate.githubAudit);
  const auditId = [
    breakdown.auditedAt ?? "",
    breakdown.auditedRepoUrl ?? "",
    github?.owner ?? "",
    github?.repo ?? "",
    String(resolveCandidateAuditScore(candidate) ?? ""),
  ].join("|");

  return JSON.stringify({
    skills,
    auditId,
    jobIds: [...jobIds].map(String).sort(),
    workType: preferredWorkType ?? candidate.preferredWorkType ?? null,
  });
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
  // Strip soft buzzwords / bare tenure before scoring so they cannot suppress %.
  const requirements = filterTechnicalRequirements([
    ...job.techStack,
    ...job.requiredSkills,
  ]);
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
  githubAudit?: unknown,
  auditScore?: number | null,
  auditBreakdown?: unknown
): string[] {
  const { overlapping, missing } = computeJobSkillOverlap(skills, job);
  const github = summarizeGithubAudit(githubAudit);
  const breakdown = parseAuditBreakdownSignals(auditBreakdown);
  const roleLabel = job.title.trim() || "this role";
  const stackSkills =
    overlapping.length > 0 ? overlapping.slice(0, 3) : skills.slice(0, 3);
  const repoLabel =
    github?.owner && github?.repo
      ? `${github.owner}/${github.repo}`
      : breakdown.auditedRepoUrl ||
        github?.owner ||
        "your audited repo";

  const stackEdge =
    overlapping.length > 0
      ? `Your Stack Edge: Your verified ${formatSkillList(stackSkills)} overlap ${roleLabel}'s listed stack — lead with those exact technologies.`
      : `Your Stack Edge: Highlight your audited ${formatSkillList(stackSkills)} and map each to the closest requirement on ${roleLabel}.`;

  const scoreLabel =
    typeof auditScore === "number" && Number.isFinite(auditScore)
      ? `${Math.round(auditScore)}/100`
      : null;
  const commitSignal =
    github && github.commit_count_sampled >= 3
      ? `${github.commit_count_sampled} recent commits on ${repoLabel}`
      : github?.language
        ? `${github.language} work on ${repoLabel}`
        : null;
  const ciSignal =
    breakdown.ciCdScore !== null && breakdown.ciCdScore > 0
      ? `CI/CD pillar ${breakdown.ciCdScore}/100`
      : filesystemHasCi(githubAudit)
        ? "verified CI workflows in the audited repo"
        : null;
  const testSignal =
    breakdown.testDensity !== null && breakdown.testDensity > 0
      ? `test density ${breakdown.testDensity}/100`
      : filesystemHasTests(githubAudit)
        ? "audited test coverage signals"
        : null;
  const productionExtras = [commitSignal, ciSignal, testSignal].filter(
    Boolean
  ) as string[];

  const verifiedProof = scoreLabel
    ? `Verified Proof: Your ${scoreLabel} production audit${
        productionExtras.length > 0
          ? ` plus ${formatSkillList(productionExtras)}`
          : ""
      } is concrete shipping evidence most applicants cannot show.`
    : productionExtras.length > 0
      ? `Verified Proof: ${formatSkillList(productionExtras)} demonstrates production cadence beyond resume claims.`
      : `Verified Proof: Keep your Provix audit current — a 75+ score turns this application into verified proof of production readiness.`;

  const technicalGaps = missing.slice(0, 2);
  const applicationAngle =
    technicalGaps.length > 0
      ? `Application Angle: Address ${formatSkillList(technicalGaps)} by pairing adjacent audited skills with repo walkthroughs — and frame velocity on ${repoLabel} to offset generic tenure asks.`
      : experienceTier
        ? `Application Angle: Open with your ${experienceTier} scope and ${scoreLabel ?? "audit"} proof, then show how ${formatSkillList(stackSkills)} maps to ${roleLabel}'s day-one work.`
        : `Application Angle: Lead the application with your stack overlap and audit proof, then show a short repo walkthrough of your highest-signal project.`;

  return uniqueDisplayList([stackEdge, verifiedProof, applicationAngle]).slice(
    0,
    3
  );
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
    const description =
      typeof record.description === "string"
        ? record.description.slice(0, 800)
        : "";
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const workType =
      record.workType ??
      resolveJobWorkType({
        employment_type: record.employment_type ?? record.employmentType,
        title,
        description,
        tags: normalizeStringArray(record.tags),
        tech_stack: techStack,
        required_skills: requiredSkills,
      });

    listings.push({
      jobId,
      title,
      company: typeof record.company === "string" ? record.company.trim() : "",
      techStack,
      requiredSkills,
      description,
      workType,
      employment_type:
        typeof record.employment_type === "string"
          ? record.employment_type
          : typeof record.employmentType === "string"
            ? record.employmentType
            : workType === "contract"
              ? "contract"
              : "full-time",
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
  githubAudit?: unknown,
  auditScore?: number | null,
  auditBreakdown?: unknown
): JobMatch {
  if (skills.length === 0) {
    return jobMatchFromReasons(job.jobId, 0, [INSUFFICIENT_DATA_REASON]);
  }

  const { overlapping, missing } = computeJobSkillOverlap(skills, job);
  const matchScore = computeDeterministicJobMatchScore({
    overlappingCount: overlapping.length,
    missingCount: missing.length,
    experienceTier,
    auditScore,
  });

  return jobMatchFromReasons(
    job.jobId,
    matchScore,
    buildHeuristicMatchReasons(
      skills,
      experienceTier,
      job,
      githubAudit,
      auditScore,
      auditBreakdown
    )
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
  const auditScore = resolveCandidateAuditScore(candidate);
  return jobs.map((job) =>
    buildHeuristicJobMatch(
      skills,
      experienceTier,
      job,
      candidate?.githubAudit,
      auditScore,
      candidate?.auditBreakdown
    )
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

  const auditScore = resolveCandidateAuditScore(candidate);
  return jobs.map((job) => {
    const heuristic = buildHeuristicJobMatch(
      skills,
      experienceTier,
      job,
      candidate.githubAudit,
      auditScore,
      candidate.auditBreakdown
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

    // Always keep the TypeScript-computed score; LLM may only supply narrative.
    return jobMatchFromReasons(
      job.jobId,
      heuristic.matchScore,
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
  jobs: JobMatchJobPayload[],
  options?: { preferredWorkType?: JobWorkType | null }
): Promise<JobMatchResult & { error?: string | null }> {
  const availability = filterJobsForAvailabilityMatch(
    jobs,
    candidate,
    options?.preferredWorkType
  );

  if (availability.error || availability.jobs.length === 0) {
    return {
      matches: [],
      error:
        availability.error ??
        "No active openings match your availability preferences right now.",
    };
  }

  const listings = parseJobListings(availability.jobs);

  try {
    const response = await fetch("/api/match-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate: {
          ...candidate,
          preferredWorkType:
            options?.preferredWorkType ?? candidate.preferredWorkType,
        },
        jobs: availability.jobs,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    const raw = (await readJsonResponse(response).catch(() => null)) as unknown;
    if (raw && typeof raw === "object") {
      const record = raw as { error?: unknown; matches?: unknown };
      if (typeof record.error === "string" && record.error.trim()) {
        return { matches: [], error: record.error.trim() };
      }

      const normalized = normalizeJobMatchResult(raw, listings, candidate);
      if (normalized.matches.length > 0 || listings.length === 0) {
        // API already applies availability filtering + fit/audit ranking.
        return { matches: normalized.matches, error: null };
      }
    }

    return {
      matches: rankJobMatchesByFitAndAudit(
        buildFallbackMatches(candidate, listings),
        candidate
      ),
      error: null,
    };
  } catch (error) {
    console.warn("Job match API unavailable, using fallback.", error);
    return {
      matches: rankJobMatchesByFitAndAudit(
        buildFallbackMatches(candidate, listings),
        candidate
      ),
      error: null,
    };
  }
}
