import {
  normalizeAuditChecks,
  type AuditCheck,
} from "@/lib/audit-checks";
import type { GitHubAuditContext } from "@/lib/github-audit";
import {
  resolveProductionAuditMetrics,
  type ProductionAuditMetrics,
} from "@/lib/production-audit-metrics";
import {
  parseRepoFilesystemEvidence,
  resolveScoreCapAudit,
  type ScoreCapAudit,
} from "@/lib/repo-filesystem";
import { clampScore0to100 } from "@/lib/score-scale";
import { resolveTalentProfileId } from "@/lib/talent-pool-profiles";
import type { ProductionAuditBreakdown } from "@/lib/production-audit";
import {
  employerVisibleProductionAudit,
  parseProductionAuditFromProfileRow,
} from "@/lib/production-audit";

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
  isSelfTaught?: boolean;
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
  productionScore?: number | null;
  auditBreakdown?: ProductionAuditBreakdown | null;
  isAuditVerified?: boolean;
};

export function productionAuditRecordFromCandidate(
  candidate: Pick<
    TalentPoolCandidate,
    "productionScore" | "auditBreakdown" | "isAuditVerified"
  >
) {
  return employerVisibleProductionAudit(
    parseProductionAuditFromProfileRow({
      production_score: candidate.productionScore,
      audit_breakdown: candidate.auditBreakdown,
      is_audit_verified: candidate.isAuditVerified,
    })
  );
}

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
  github_audit?: GitHubAuditContext | null;
  scoreCap?: ScoreCapAudit | null;
  metrics?: ProductionAuditMetrics | null;
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
export const SCREENING_ENQUEUE_TIMEOUT_MS = 20_000;
export const SCREENING_BACKGROUND_WAIT_MS = 180_000;

export type ScreeningQueueStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type ScreeningAcceptedResponse = {
  accepted: true;
  status: "pending";
  screening_id: string;
  candidate_key: string;
  run_id: string;
};

export type ScreeningQueueRow = {
  id?: string | null;
  status?: string | null;
  integrity_score?: number | null;
  audit_data?: unknown;
};

export type ScreeningQueueView =
  | { phase: "pending" | "processing" }
  | { phase: "failed"; error: string }
  | { phase: "completed"; result: DeepScreeningResult }
  | { phase: "empty" };

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
  const integrity_score = clampScore0to100(result.integrity_score);
  const filesystem = result.github_audit?.filesystem
    ? parseRepoFilesystemEvidence(result.github_audit.filesystem)
    : null;
  const metrics = resolveProductionAuditMetrics({
    metrics: result.metrics,
    filesystem,
  });

  return {
    ...result,
    integrity_score,
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
    scoreCap: resolveScoreCapAudit(
      integrity_score,
      result.scoreCap,
      filesystem
    ),
    metrics,
  };
}

function screeningAuditRecord(
  value: unknown
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function isScreeningAcceptedResponse(
  value: unknown
): value is ScreeningAcceptedResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.accepted === true &&
    record.status === "pending" &&
    typeof record.screening_id === "string" &&
    record.screening_id.trim().length > 0
  );
}

export function readScreeningQueueState(
  row: ScreeningQueueRow | null | undefined
): ScreeningQueueView {
  if (!row) {
    return { phase: "empty" };
  }

  const audit = screeningAuditRecord(row.audit_data);
  const embedded =
    typeof audit?.status === "string" ? audit.status : null;
  const status = row.status ?? embedded;

  if (status === "pending" || status === "processing") {
    return { phase: status };
  }

  if (status === "failed") {
    const error =
      typeof audit?.error === "string" && audit.error.trim()
        ? audit.error.trim()
        : "The live audit could not be completed. Please retry.";
    return { phase: "failed", error };
  }

  if (audit && typeof audit.integrity_score === "number") {
    return {
      phase: "completed",
      result: coerceDeepScreeningResult(audit as DeepScreeningResult),
    };
  }

  if (typeof row.integrity_score === "number" && audit) {
    return {
      phase: "completed",
      result: coerceDeepScreeningResult({
        ...(audit as DeepScreeningResult),
        integrity_score: row.integrity_score,
      }),
    };
  }

  return { phase: "empty" };
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
    return "text-violet-400 border-violet-500/30 bg-violet-500/10";
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
