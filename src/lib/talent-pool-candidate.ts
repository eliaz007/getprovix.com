import {
  normalizeAuditChecks,
  type AuditCheck,
} from "@/lib/audit-checks";
import { clampScore0to100 } from "@/lib/score-scale";
import { resolveTalentProfileId } from "@/lib/talent-pool-profiles";

export type TalentPoolCandidate = {
  id: string;
  profileId?: string | null;
  name: string;
  fullName: string;
  profileName: string;
  firstName: string;
  lastName: string;
  headline: string;
  codenameAlias: string;
  country: string;
  timezone: string;
  workPreference: string;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  role: string;
  university: string;
  major: string;
  gpa: string;
  graduationYear: string;
  skills: string[];
  rating: string;
  execution_score?: number | string | null;
  status: string;
  experienceLevel: string;
  roleType: string;
  availability: string;
  bio: string;
  github: string;
  demoVideo: string;
  projects: string[];
  matchScore: number;
  matchPending?: boolean;
  verifiedOnProvix?: boolean;
};

export type InterviewCheatSheetQuestion = {
  question: string;
  category: string;
  what_to_listen_for: string;
};

export type DeepScreeningResult = {
  integrity_score: number;
  timeline_flags: string[];
  artifact_analysis: string;
  technical_depth_summary: string;
  interview_questions: InterviewCheatSheetQuestion[];
  checks: AuditCheck[];
  github_audit?: {
    repo_url: string;
    owner: string;
    repo: string;
    stars: number | null;
    forks: number | null;
    created_at: string | null;
    language: string | null;
    commit_count_sampled: number;
    commit_dates: string[];
    readme_excerpt: string | null;
    fetch_warnings: string[];
  } | null;
};

export type ScreeningJobContext = {
  title: string;
  company?: string | null;
  tags?: string[] | null;
  tech_stack?: string[] | string | null;
  required_skills?: string[] | string | null;
  location?: string | null;
};

export const AUDIT_STORAGE_PREFIX = "vanguardx_audit_";

export const DEEP_SCREENING_STAGES = [
  "Auditing GitHub repositories & branch structure...",
  "Verifying commit chronology & code authenticity...",
  "Synthesizing 0–100 score & founder interview rubrics...",
] as const;

export const DEEP_SCREENING_FETCH_TIMEOUT_MS = 180_000;

export function isAbortOrTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const name = "name" in error ? String(error.name) : "";
  if (name === "AbortError" || name === "TimeoutError") {
    return true;
  }

  const message = "message" in error ? String(error.message) : "";
  return /aborted|timed?\s*out|timeout/i.test(message);
}

export function isNetworkDropError(error: unknown): boolean {
  if (isAbortOrTimeoutError(error)) {
    return true;
  }

  if (error instanceof TypeError) {
    return true;
  }

  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  return /failed to fetch|networkerror|load failed|err_network|econnreset|econnrefused|socket hang up/i.test(
    message
  );
}

export function describeDeepScreeningFailure(
  error: unknown,
  status?: number | null
): string {
  if (status === 504 || status === 408 || isAbortOrTimeoutError(error)) {
    return "The live audit timed out during the GitHub fetch sequence. Please retry.";
  }

  if (status === 502 || status === 503 || isNetworkDropError(error)) {
    return "The live audit dropped before it finished. Check your connection and retry.";
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim() &&
    !/^deep screening failed/i.test(error.message)
  ) {
    return error.message.trim();
  }

  return "Could not complete the live audit. Please retry.";
}

export function getCandidateScreeningKey(candidate: TalentPoolCandidate): string {
  return (
    resolveTalentProfileId(candidate) ||
    candidate.profileId?.trim() ||
    candidate.id
  );
}

export function coerceDeepScreeningResult(
  result: DeepScreeningResult
): DeepScreeningResult {
  return {
    ...result,
    integrity_score: clampScore0to100(result.integrity_score),
    checks: normalizeAuditChecks(
      Array.isArray(result.checks) && result.checks.length > 0
        ? result.checks
        : [
            {
              id: "artifact_analysis",
              title: "Artifact Analysis (Check 1)",
              summary: result.artifact_analysis,
            },
          ]
    ),
  };
}

export function parseStoredScreeningResult(raw: string): DeepScreeningResult | null {
  try {
    const parsed = JSON.parse(raw) as DeepScreeningResult;
    if (
      typeof parsed.integrity_score === "number" &&
      Array.isArray(parsed.timeline_flags) &&
      typeof parsed.artifact_analysis === "string"
    ) {
      return coerceDeepScreeningResult(parsed);
    }
  } catch {
    // Ignore malformed cache entries.
  }
  return null;
}

export function getIntegrityScoreClass(score: number): string {
  if (score >= 80) {
    return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
  }
  if (score >= 60) {
    return "text-amber-400 border-amber-500/30 bg-amber-500/10";
  }
  return "text-red-400 border-red-500/30 bg-red-500/10";
}

export function formatExternalUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

export function getCandidateProjectLinks(
  candidate: TalentPoolCandidate
): Array<{ label: string; url: string }> {
  const links: Array<{ label: string; url: string }> = [];

  const github =
    candidate.github_url?.trim() || candidate.github?.trim() || "";
  if (github) {
    links.push({
      label: github.includes("github.com") ? "GitHub" : "Portfolio",
      url: formatExternalUrl(github),
    });
  }

  const linkedin = candidate.linkedin_url?.trim() || "";
  if (linkedin) {
    links.push({
      label: "LinkedIn",
      url: formatExternalUrl(linkedin),
    });
  }

  const demo = candidate.demoVideo?.trim() || "";
  if (demo) {
    links.push({
      label: "Demo Reel",
      url: formatExternalUrl(demo),
    });
  }

  return links;
}

export function clampDisplayedMatch(value: number): number {
  return clampScore0to100(value, 0);
}

export function formatTalentMatchLabel(percentage: number, isPending = false): string {
  if (isPending) {
    return "Match Pending";
  }
  return `${clampDisplayedMatch(percentage)}% Match`;
}

export function parseProofOfWorkProjects(value: string | null | undefined): string[] {
  return (value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function resolveCandidateGithubUrl(input: {
  github_url?: string | null;
  portfolio_url?: string | null;
  github?: string | null;
}): { githubUrl: string; github: string } {
  const portfolioUrl = input.portfolio_url?.trim() || "";
  const explicitGithub = input.github_url?.trim() || input.github?.trim() || "";
  const isLinkedIn = portfolioUrl.toLowerCase().includes("linkedin");
  const githubUrl =
    explicitGithub || (!isLinkedIn && portfolioUrl ? portfolioUrl : "");

  return {
    githubUrl,
    github: githubUrl || portfolioUrl,
  };
}
