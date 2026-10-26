import { formatCommitHistoryReason } from "@/lib/commit-history-score";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  scoreTesting,
  type CommitHistoryStat,
} from "@/lib/production-audit-metrics";
import {
  resolveUnitTestFileCount,
  type RepoFilesystemEvidence,
  type ScoreCapAudit,
} from "@/lib/repo-filesystem";

export type { CommitHistoryStat };

export type ReadinessBadge = {
  label: string;
  className: string;
  meterClassName: string;
};

/**
 * Verification labels for contract / full-time audits.
 * No third "Sparse History" tier — fail closed to Needs Refinement.
 */
export type VerificationTier = "Provix Verified" | "Needs Refinement";

export const VERIFICATION_TIER_PROVIX = "Provix Verified" as const;
/** @deprecated Third tier removed; kept for older string compares. */
export const VERIFICATION_TIER_SPARSE_HISTORY =
  "Code Verified · Sparse History" as const;
export const VERIFICATION_TIER_NEEDS_REFINEMENT = "Needs Refinement" as const;

export const CODE_HEALTH_VERIFIED_THRESHOLD = 75;
/** Delivery Hygiene / History floor for Provix Verified (contract + full-time). */
export const DELIVERY_HYGIENE_VERIFIED_THRESHOLD = 80;

export const HISTORY_BLOCKS_QUALIFY_NOTE =
  "History needs 80+ to qualify." as const;

export type ChecklistTone = "pass" | "warn" | "fail";

export type RepoActivityStatus = "active" | "stable";

export type ExecutiveChecklistItem = {
  id: "ci" | "error_handling" | "tests" | "history";
  label: string;
  status: string;
  tone: ChecklistTone;
};

/**
 * Shared Verified / publish / onboarding-track gate input.
 * `historyAvailable: false` means the commit list fetch failed — History
 * cannot pass even if a numeric hygiene placeholder is 100.
 */
export type ProvixVerifiedGateInput = {
  codeHealthScore: number;
  deliveryHygieneScore?: number | null;
  historyAvailable?: boolean | null;
};

/** History ≥ 80 and a successful commit fetch. */
export function isHistoryGateMet(
  input: Pick<
    ProvixVerifiedGateInput,
    "deliveryHygieneScore" | "historyAvailable"
  >
): boolean {
  if (input.historyAvailable === false) {
    return false;
  }
  if (
    typeof input.deliveryHygieneScore !== "number" ||
    !Number.isFinite(input.deliveryHygieneScore)
  ) {
    return false;
  }
  return (
    clampScore0to100(input.deliveryHygieneScore) >=
    DELIVERY_HYGIENE_VERIFIED_THRESHOLD
  );
}

/**
 * Single source of truth for Provix Verified, onboarding track qualification,
 * and production-score publishing: Code Health ≥ 75 and History ≥ 80 with
 * fetched commit history.
 */
export function meetsProvixVerifiedGates(
  input: ProvixVerifiedGateInput
): boolean {
  return (
    clampScore0to100(input.codeHealthScore) >= CODE_HEALTH_VERIFIED_THRESHOLD &&
    isHistoryGateMet(input)
  );
}

/** Full-Time / Contract track qualification (same floors as Verified). */
export function qualifiesHiringTrack(
  trackScore: number,
  deliveryHygieneScore?: number | null,
  historyAvailable?: boolean | null
): boolean {
  return meetsProvixVerifiedGates({
    codeHealthScore: trackScore,
    deliveryHygieneScore,
    historyAvailable,
  });
}

/**
 * Dual-threshold verification (contract + full-time share these floors):
 * - Provix Verified: codeHealth >= 75 AND history gate met
 * - Needs Refinement: otherwise (no Sparse History tier)
 */
export function assignVerificationTier(
  codeHealthScore: number,
  deliveryHygieneScore?: number | null,
  historyAvailable?: boolean | null
): VerificationTier {
  return meetsProvixVerifiedGates({
    codeHealthScore,
    deliveryHygieneScore,
    historyAvailable,
  })
    ? VERIFICATION_TIER_PROVIX
    : VERIFICATION_TIER_NEEDS_REFINEMENT;
}

export function getVerificationTierBadge(
  codeHealthScore: number,
  deliveryHygieneScore?: number | null,
  historyAvailable?: boolean | null
): ReadinessBadge {
  const tier = assignVerificationTier(
    codeHealthScore,
    deliveryHygieneScore,
    historyAvailable
  );

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
 * Readiness / verification badge using the shared Provix Verified gates.
 */
export function getReadinessBadge(
  score: number,
  deliveryHygieneScore?: number | null,
  historyAvailable?: boolean | null
): ReadinessBadge {
  return getVerificationTierBadge(
    score,
    deliveryHygieneScore,
    historyAvailable
  );
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

  const testFiles = resolveUnitTestFileCount(filesystem);
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
 * Kept for callers; Executive Checklist uses History instead.
 */
export function classifyCommitCadence(
  commitDates: string[] | null | undefined,
  now = Date.now(),
  _commitStats?: CommitHistoryStat[] | null
): {
  status: string;
  tone: ChecklistTone;
  /** Always 0 — activity is informational. */
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

/** Executive Checklist History row from Delivery Hygiene + commit signals. */
export function classifyHistoryChecklist(
  deliveryHygieneScore: number,
  commitDates?: string[] | null,
  commitStats?: CommitHistoryStat[] | null,
  historyAvailable: boolean | null = true
): { status: string; tone: ChecklistTone } {
  if (historyAvailable === false) {
    return { status: "History unavailable", tone: "fail" };
  }
  const hygiene = clampScore0to100(deliveryHygieneScore);
  const status = formatCommitHistoryReason(commitDates, commitStats);
  // Verified History floor is 80 — do not treat 60 as a pass band.
  if (isHistoryGateMet({ deliveryHygieneScore: hygiene, historyAvailable })) {
    return { status, tone: "pass" };
  }
  if (hygiene > 0) {
    return { status, tone: "warn" };
  }
  return { status, tone: "fail" };
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
  commitHistoryPenalty?: number | null;
  deliveryHygieneScore?: number | null;
  historyAvailable?: boolean | null;
  testingScore?: number | null;
}): ExecutiveChecklistItem[] {
  const artifacts = coreArtifactFlags(input.scoreCap, input.filesystem);
  const tests = classifyTestSuites(
    artifacts.tests,
    input.filesystem,
    input.testingScore
  );
  const hygiene =
    typeof input.deliveryHygieneScore === "number" &&
    Number.isFinite(input.deliveryHygieneScore)
      ? input.deliveryHygieneScore
      : typeof input.commitHistoryPenalty === "number" &&
          Number.isFinite(input.commitHistoryPenalty)
        ? Math.max(0, 100 - Math.max(0, input.commitHistoryPenalty))
        : 100;
  const history = classifyHistoryChecklist(
    hygiene,
    input.commitDates,
    input.commitStats,
    input.historyAvailable
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
      id: "history",
      label: "History",
      status: history.status,
      tone: history.tone,
    },
  ];
}
