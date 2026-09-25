import { clampScore0to100 } from "@/lib/score-scale";
import { scoreTesting } from "@/lib/production-audit-metrics";
import {
  isUnitTestFile,
  type RepoFilesystemEvidence,
  type ScoreCapAudit,
} from "@/lib/repo-filesystem";

export type ReadinessBadge = {
  label: string;
  className: string;
  meterClassName: string;
};

export type ChecklistTone = "pass" | "warn" | "fail";

export type RepoActivityStatus = "active" | "stable";

export type ExecutiveChecklistItem = {
  id: "ci" | "error_handling" | "tests" | "commit_cadence";
  label: string;
  status: string;
  tone: ChecklistTone;
};

export function getReadinessBadge(score: number): ReadinessBadge {
  const clamped = clampScore0to100(score);

  if (clamped >= 85) {
    return {
      label: "Production-Ready Senior",
      className: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
      meterClassName: "text-emerald-400",
    };
  }

  if (clamped >= 75) {
    return {
      label: "Talent Network Eligible",
      className: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
      meterClassName: "text-emerald-400",
    };
  }

  if (clamped >= 60) {
    return {
      label: "Competent / Intermediate",
      className: "text-violet-300 bg-violet-500/10 border-violet-500/30",
      meterClassName: "text-violet-400",
    };
  }

  return {
    label: "Action Required: Below 75 Bar",
    className: "text-rose-300 bg-rose-500/10 border-rose-500/30",
    meterClassName: "text-rose-400",
  };
}

/** @deprecated Inactivity is an informational tag only — never a numeric ding. */
export const STALE_COMMIT_HISTORY_PENALTY = 0;
export const CLUSTERED_COMMIT_HISTORY_PENALTY = 0;
export const MAX_COMMIT_HISTORY_PENALTY = 0;
const STALE_AFTER_MS = 180 * 24 * 60 * 60 * 1000;

export const READINESS_QUALITATIVE_WEIGHT = 0.45;
export const READINESS_PRODUCTION_WEIGHT = 0.55;

export function normalizeCommitDates(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.toLowerCase() !== "unknown");
}

function parseCommitTimestamps(
  commitDates: string[] | null | undefined
): number[] {
  return (commitDates ?? [])
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
}

function isStaleCommitHistory(
  parsed: number[],
  now = Date.now()
): boolean {
  if (parsed.length === 0) {
    return true;
  }

  return now - parsed[parsed.length - 1] >= STALE_AFTER_MS;
}

export function classifyRepoActivityStatus(
  commitDates: string[] | null | undefined,
  now = Date.now()
): RepoActivityStatus {
  return isStaleCommitHistory(parseCommitTimestamps(commitDates), now)
    ? "stable"
    : "active";
}

/** Always 0 — commit age / inactivity is informational, not a quality ding. */
export function scoreCommitHistoryPenalty(
  _commitDates?: string[] | null,
  _now?: number
): number {
  return 0;
}

/** UI label kept for older dossiers. Inactivity no longer deducts points. */
export function formatHistoryDeductionLabel(_penalty?: number): string {
  return "History 0";
}

export function hasCoreProductionArtifacts(
  scoreCap?: ScoreCapAudit | null,
  filesystem?: RepoFilesystemEvidence | null
): boolean {
  const flags = coreArtifactFlags(scoreCap, filesystem);
  return flags.tests && flags.ci && flags.error_handling;
}

/**
 * Inactivity never lowers the score. Floor qualitative output to the
 * production pillar score when the model still emits a history ding.
 */
export function applyCommitHistoryScoreFloor(
  score: number,
  productionScore: number,
  _commitDates?: string[] | null,
  _now?: number
): number {
  return clampScore0to100(
    Math.max(clampScore0to100(score), clampScore0to100(productionScore))
  );
}

/**
 * Blend qualitative LLM score with the file-tree production scorecard.
 * Commit age is informational only and is not subtracted here.
 */
export function blendReadinessScore(input: {
  qualitativeScore: number;
  productionScore: number;
  /** @deprecated History floor no longer depends on core artifacts. */
  coreArtifactsPresent?: boolean;
  commitDates?: string[] | null;
  now?: number;
}): number {
  const production = clampScore0to100(input.productionScore);
  const qualitativeAdjusted = applyCommitHistoryScoreFloor(
    input.qualitativeScore,
    production,
    input.commitDates,
    input.now
  );

  return clampScore0to100(
    Math.round(
      qualitativeAdjusted * READINESS_QUALITATIVE_WEIGHT +
        production * READINESS_PRODUCTION_WEIGHT
    )
  );
}

/**
 * Lift an already-persisted readiness score when a prior scan applied a
 * heavy stale-history ding (e.g. History −25 with a Verified Human checklist).
 */
export function resolveDisplayedReadinessScore(input: {
  score: number;
  productionScore?: number;
  filesystem?: RepoFilesystemEvidence | null;
  scoreCap?: ScoreCapAudit | null;
  commitDates?: string[] | null;
  now?: number;
}): number {
  const score = clampScore0to100(input.score);
  const production = clampScore0to100(input.productionScore);

  if (!input.filesystem?.inspected || production <= 0) {
    return score;
  }

  return applyCommitHistoryScoreFloor(
    score,
    production,
    input.commitDates,
    input.now
  );
}

function coreArtifactFlags(
  scoreCap?: ScoreCapAudit | null,
  filesystem?: RepoFilesystemEvidence | null
): { tests: boolean; ci: boolean; error_handling: boolean } {
  if (filesystem) {
    return {
      tests: filesystem.test_paths.length > 0,
      ci: filesystem.ci_workflow_paths.length > 0,
      error_handling: filesystem.error_handling_paths.length > 0,
    };
  }

  return {
    tests: Boolean(scoreCap?.coreArtifacts.tests),
    ci: Boolean(scoreCap?.coreArtifacts.ci),
    error_handling: Boolean(scoreCap?.coreArtifacts.error_handling),
  };
}

function testCoverageRatio(
  filesystem?: RepoFilesystemEvidence | null
): number | null {
  if (!filesystem?.inspected) {
    return null;
  }

  const testFiles =
    typeof filesystem.unit_test_file_count === "number"
      ? filesystem.unit_test_file_count
      : filesystem.test_paths.filter(isUnitTestFile).length;
  if (testFiles === 0) {
    return 0;
  }

  const sourceFiles = Math.max(
    filesystem.executable_source_count > 0
      ? filesystem.executable_source_count
      : filesystem.source_file_count,
    filesystem.file_count - testFiles,
    testFiles
  );
  return testFiles / sourceFiles;
}

export function classifyTestSuites(
  testsPresent: boolean,
  filesystem?: RepoFilesystemEvidence | null,
  testingScore?: number | null
): { status: string; tone: ChecklistTone } {
  const paths = filesystem?.test_paths ?? [];
  if (!testsPresent && paths.length === 0) {
    return { status: "No tests", tone: "fail" };
  }

  const ratio = testCoverageRatio(filesystem);
  const score =
    typeof testingScore === "number" && Number.isFinite(testingScore)
      ? clampScore0to100(testingScore)
      : filesystem?.inspected
        ? scoreTesting(filesystem)
        : testsPresent
          ? 50
          : 0;

  if (score < 30 || (ratio != null && ratio < 0.15)) {
    return { status: "Coverage Gaps", tone: "warn" };
  }

  if (score < 75 && !(ratio != null && ratio >= 0.35)) {
    return { status: "Partial Suite", tone: "warn" };
  }

  if (score >= 75 || (ratio != null && ratio >= 0.35)) {
    return { status: "Full coverage", tone: "pass" };
  }

  return { status: "Partial Suite", tone: "warn" };
}

export function classifyCommitCadence(
  commitDates: string[] | null | undefined,
  now = Date.now()
): {
  status: RepoActivityStatus;
  tone: ChecklistTone;
  penalty: number;
  activity: RepoActivityStatus;
} {
  const activity = classifyRepoActivityStatus(commitDates, now);

  return {
    status: activity,
    activity,
    tone: activity === "active" ? "pass" : "warn",
    penalty: 0,
  };
}

export const PRODUCTION_READY_VERIFIED =
  "Production-ready engineering standards verified across pipelines, test coverage, and schema boundaries.";

export function isProductionReadyAudit(metrics: {
  productionScore: number;
  architecture: number;
  testing: number;
  devops: number;
  resilience: number;
}): boolean {
  return (
    metrics.productionScore >= 90 &&
    metrics.architecture >= 85 &&
    metrics.testing >= 85 &&
    metrics.devops >= 85 &&
    metrics.resilience >= 85
  );
}

export function targetedAuditSuggestions(input: {
  language: string | null;
  testingScore: number;
  testFileCount: number;
  devopsScore: number;
  needsSchemaValidation: boolean;
  needsBuildGate: boolean;
}): string[] {
  const javascript = /^(typescript|javascript|tsx|jsx)$/i.test(
    input.language?.trim() ?? ""
  );
  const suggestions: string[] = [];

  if (input.needsBuildGate && input.devopsScore < 75) {
    suggestions.push(
      "Add a production build step (`next build` or `tsc`) to the CI workflow."
    );
  }
  if (input.needsSchemaValidation) {
    suggestions.push(
      "Add Zod schema parsing on API route handlers that currently cast JSON with `as Type`."
    );
  }
  if (input.testingScore < 70 && input.testFileCount < 10) {
    suggestions.push(
      javascript
        ? "Expand integration or end-to-end coverage with a TypeScript test such as src/foo.test.ts."
        : "Expand integration or end-to-end coverage with a test file that matches this repository's primary language."
    );
  }

  return suggestions;
}

export function buildExecutiveChecklist(input: {
  scoreCap?: ScoreCapAudit | null;
  filesystem?: RepoFilesystemEvidence | null;
  commitDates?: string[] | null;
  testingScore?: number | null;
}): ExecutiveChecklistItem[] {
  const artifacts = coreArtifactFlags(input.scoreCap, input.filesystem);
  const tests = classifyTestSuites(
    artifacts.tests,
    input.filesystem,
    input.testingScore
  );
  const cadence = classifyCommitCadence(input.commitDates);

  return [
    {
      id: "ci",
      label: "CI/CD Pipelines",
      status: artifacts.ci ? "Configured" : "None detected",
      tone: artifacts.ci ? "pass" : "fail",
    },
    {
      id: "error_handling",
      label: "Error Handling",
      status: artifacts.error_handling ? "Standardized" : "Missing boundaries",
      tone: artifacts.error_handling ? "pass" : "fail",
    },
    {
      id: "tests",
      label: "Test Suites",
      status: tests.status,
      tone: tests.tone,
    },
    {
      id: "commit_cadence",
      label: "Repo Activity",
      status: cadence.activity,
      tone: cadence.tone,
    },
  ];
}
