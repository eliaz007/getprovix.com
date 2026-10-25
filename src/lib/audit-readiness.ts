import { clampScore0to100 } from "@/lib/score-scale";
import {
  scoreTesting,
  type CommitHistoryStat,
} from "@/lib/production-audit-metrics";
import {
  isUnitTestFile,
  type RepoFilesystemEvidence,
  type ScoreCapAudit,
} from "@/lib/repo-filesystem";

export type { CommitHistoryStat };

export type ReadinessBadge = {
  label: string;
  className: string;
  meterClassName: string;
};

/** Verification labels from Code Health only. */
export type VerificationTier = "Provix Verified" | "Needs Refinement";

export const VERIFICATION_TIER_PROVIX = "Provix Verified" as const;
/** @deprecated Sparse-history dual-gate retired; kept for older string compares. */
export const VERIFICATION_TIER_SPARSE_HISTORY =
  "Code Verified · Sparse History" as const;
export const VERIFICATION_TIER_NEEDS_REFINEMENT = "Needs Refinement" as const;

export const CODE_HEALTH_VERIFIED_THRESHOLD = 75;
/** @deprecated Delivery Hygiene gate retired; Code Health alone verifies. */
export const DELIVERY_HYGIENE_VERIFIED_THRESHOLD = 80;

export type ChecklistTone = "pass" | "warn" | "fail";

export type RepoActivityStatus = "active" | "stable";

export type ExecutiveChecklistItem = {
  id: "ci" | "error_handling" | "tests" | "commit_cadence";
  label: string;
  status: string;
  tone: ChecklistTone;
};

/**
 * Verification badge from Code Health:
 * - Provix Verified: codeHealth >= 75
 * - Needs Refinement: codeHealth < 75
 *
 * Second arg is ignored (legacy dual-gate callers).
 */
export function assignVerificationTier(
  codeHealthScore: number,
  _deliveryHygieneScore?: number
): VerificationTier {
  const health = clampScore0to100(codeHealthScore);
  if (health < CODE_HEALTH_VERIFIED_THRESHOLD) {
    return VERIFICATION_TIER_NEEDS_REFINEMENT;
  }
  return VERIFICATION_TIER_PROVIX;
}

export function getVerificationTierBadge(
  codeHealthScore: number,
  _deliveryHygieneScore?: number
): ReadinessBadge {
  const tier = assignVerificationTier(codeHealthScore);

  if (tier === VERIFICATION_TIER_PROVIX) {
    return {
      label: tier,
      className: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
      meterClassName: "text-emerald-400",
    };
  }

  return {
    label: tier,
    className: "text-rose-300 bg-rose-500/10 border-rose-500/30",
    meterClassName: "text-rose-400",
  };
}

/**
 * Readiness / verification badge from Code Health.
 * Optional second arg is ignored (legacy dual-gate callers).
 */
export function getReadinessBadge(
  score: number,
  _deliveryHygieneScore?: number | null
): ReadinessBadge {
  return getVerificationTierBadge(score);
}

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

/**
 * Informational repo activity from sampled commit dates only.
 * Commit-history dump penalties are retired — no score impact.
 */
export function classifyCommitCadence(
  commitDates: string[] | null | undefined,
  now = Date.now(),
  _commitStats?: CommitHistoryStat[] | null
): {
  status: string;
  tone: ChecklistTone;
  /** Always 0 — commit penalties removed. */
  penalty: number;
  /** Always 0 — kept for callers that still read the field. */
  commitHistoryPenalty: number;
  activity: RepoActivityStatus;
} {
  const activity = classifyRepoActivityStatus(commitDates, now);
  return {
    status: activity,
    activity,
    tone: activity === "active" ? "pass" : "warn",
    penalty: 0,
    commitHistoryPenalty: 0,
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
  const language = input.language?.trim().toLowerCase() ?? "";
  const javascript = /^(typescript|javascript|tsx|jsx)$/i.test(language);
  const suggestions: string[] = [];

  if (input.needsBuildGate && input.devopsScore < 75) {
    if (javascript) {
      suggestions.push(
        "Add a production build step (`next build` or `tsc`) to the CI workflow."
      );
    } else if (language === "go") {
      suggestions.push(
        "Add a CI step that runs `go build ./...` (and ideally `go test ./...`) on pull requests."
      );
    } else if (language === "python" || language === "jupyter notebook") {
      suggestions.push(
        "Add a CI step that runs `pytest` (and ideally `ruff check` or `mypy`) on pull requests."
      );
    } else if (language === "rust") {
      suggestions.push(
        "Add a CI step that runs `cargo check` and `cargo test` on pull requests."
      );
    } else {
      suggestions.push(
        "Add a CI workflow that runs this repository's native lint, test, and build commands on pull requests."
      );
    }
  }
  if (javascript && input.needsSchemaValidation) {
    suggestions.push(
      "Add Zod schema parsing on API route handlers that currently cast JSON with `as Type`."
    );
  }
  if (input.testingScore < 70 && input.testFileCount < 10) {
    suggestions.push(
      javascript
        ? "Expand integration or end-to-end coverage with a TypeScript test such as src/foo.test.ts."
        : language === "go"
          ? "Expand package coverage with a Go test such as foo_test.go using `go test ./...`."
          : language === "python" || language === "jupyter notebook"
            ? "Expand coverage with a pytest module such as tests/test_app.py."
            : language === "rust"
              ? "Expand coverage with a Rust unit/integration test and `cargo test`."
              : "Expand integration or end-to-end coverage with a test file that matches this repository's primary language."
    );
  }

  return suggestions;
}

export function buildExecutiveChecklist(input: {
  scoreCap?: ScoreCapAudit | null;
  filesystem?: RepoFilesystemEvidence | null;
  commitDates?: string[] | null;
  commitStats?: CommitHistoryStat[] | null;
  /** @deprecated Ignored — commit-history penalties retired. */
  commitHistoryPenalty?: number | null;
  testingScore?: number | null;
}): ExecutiveChecklistItem[] {
  const artifacts = coreArtifactFlags(input.scoreCap, input.filesystem);
  const tests = classifyTestSuites(
    artifacts.tests,
    input.filesystem,
    input.testingScore
  );
  const cadence = classifyCommitCadence(
    input.commitDates,
    Date.now(),
    input.commitStats
  );

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
      status: cadence.status,
      tone: cadence.tone,
    },
  ];
}
