import {
  DEFAULT_AUDIT_MODE,
  normalizeAuditMode,
  weightedScoreForMode,
  weightsForAuditMode,
  type AuditMode,
} from "@/lib/audit-mode";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  emptyArchitectureSignals,
  emptyRepoFilesystemEvidence,
  isCiWorkflowPath,
  isErrorHandlingPath,
  isNoisePath,
  isTestPath,
  isUnitTestFile,
  parseRepoFilesystemEvidence,
  type ArchitectureSignals,
  type CiPipelineDepth,
  type RepoFilesystemEvidence,
  type RepoKind,
} from "@/lib/repo-filesystem";

/**
 * Default weights (full-time enterprise baseline).
 * Prefer `weightsForAuditMode(auditMode)` when a mode is selected.
 */
export const PRODUCTION_METRIC_WEIGHTS = {
  architecture: 0.3,
  testing: 0.3,
  devops: 0.15,
  resilience: 0.25,
} as const;

/** Optional per-commit sample kept for GitHub fetch payloads (not scored). */
export type CommitHistoryStat = {
  date: string;
  additions?: number;
  deletions?: number;
  filesChanged?: number;
  message?: string;
};

export type ProductionAuditHistoryInput = {
  commitDates?: string[] | null;
  commitStats?: CommitHistoryStat[] | null;
};

export type ProductionAuditMetrics = {
  architecture: number;
  testing: number;
  devops: number;
  resilience: number;
  /**
   * Headline Codebase Quality Index. Mapped to `codeHealthScore` (weighted
   * AST pillars). Kept for UI, PDF, percentile, and DB consumers.
   */
  productionScore: number;
  /**
   * Weighted AST pillars only (Architecture, Testing, DevOps, Resilience).
   * Optional on legacy persisted blobs; prefer `resolveCodeHealthScore`.
   */
  codeHealthScore?: number;
  /**
   * @deprecated Unused in product UI. Kept optional for legacy audit blobs;
   * live audits still emit 100 for schema compatibility.
   */
  deliveryHygieneScore?: number;
  /** 30 when the repo is a fork or generated template; otherwise 0. */
  upstreamDerivativePenalty: number;
  /**
   * @deprecated Always 0 on new audits. Kept for persisted / UI consumers.
   */
  commitHistoryPenalty: number;
  /** @deprecated Alias of devops — kept for persisted / UI consumers. */
  ciCdHealth: number;
  /** @deprecated Alias of testing. */
  testAssertionDensity: number;
  /** @deprecated Alias of resilience. */
  errorBoundaries: number;
  weights: {
    architecture: number;
    testing: number;
    devops: number;
    resilience: number;
    ciCdHealth: number;
    testAssertionDensity: number;
    errorBoundaries: number;
  };
  evidence: {
    inspected: boolean;
    truncated: boolean;
    fileCount: number;
    ciWorkflowCount: number;
    githubWorkflowCount: number;
    testFileCount: number;
    errorBoundaryCount: number;
    handlerCount: number;
    architecturePathCount: number;
    repoKind: RepoKind;
    ciWorkflowPaths: string[];
    testPaths: string[];
    errorBoundaryPaths: string[];
    architecturePaths: string[];
    architectureSignals: ArchitectureSignals;
  };
};

const GITHUB_WORKFLOW_PATH = /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i;

/** React App Router / component error-boundary filenames. */
const REACT_ERROR_BOUNDARY_PATH =
  /(^|\/)(global-)?error\.[cm]?[jt]sx?$|(^|\/).*error[-_]?boundar[^/]*\.[cm]?[jt]sx?$/i;

export function isGithubWorkflowPath(path: string): boolean {
  if (isNoisePath(path)) {
    return false;
  }
  return GITHUB_WORKFLOW_PATH.test(path);
}

export function isReactErrorBoundaryPath(path: string): boolean {
  if (isNoisePath(path)) {
    return false;
  }
  return REACT_ERROR_BOUNDARY_PATH.test(path);
}

function withAliases(
  parts: {
    architecture: number;
    testing: number;
    devops: number;
    resilience: number;
    productionScore: number;
  },
  mode: AuditMode = DEFAULT_AUDIT_MODE
): Pick<
  ProductionAuditMetrics,
  | "architecture"
  | "testing"
  | "devops"
  | "resilience"
  | "productionScore"
  | "ciCdHealth"
  | "testAssertionDensity"
  | "errorBoundaries"
  | "weights"
> {
  const modeWeights = weightsForAuditMode(mode);
  return {
    architecture: parts.architecture,
    testing: parts.testing,
    devops: parts.devops,
    resilience: parts.resilience,
    productionScore: parts.productionScore,
    ciCdHealth: parts.devops,
    testAssertionDensity: parts.testing,
    errorBoundaries: parts.resilience,
    weights: {
      architecture: modeWeights.architecture,
      testing: modeWeights.testing,
      devops: modeWeights.devops,
      resilience: modeWeights.resilience,
      ciCdHealth: modeWeights.devops,
      testAssertionDensity: modeWeights.testing,
      errorBoundaries: modeWeights.resilience,
    },
  };
}

/** Prefer explicit code health; fall back to headline production score. */
export function resolveCodeHealthScore(
  metrics: Pick<ProductionAuditMetrics, "productionScore" | "codeHealthScore">
): number {
  if (
    typeof metrics.codeHealthScore === "number" &&
    Number.isFinite(metrics.codeHealthScore)
  ) {
    return clampScore0to100(metrics.codeHealthScore);
  }
  return clampScore0to100(metrics.productionScore);
}

/**
 * Delivery Hygiene without commit-based deductions. Prefer an explicit stored
 * score; otherwise treat hygiene as clean (100).
 */
export function resolveDeliveryHygieneScore(
  metrics: Pick<
    ProductionAuditMetrics,
    "deliveryHygieneScore" | "commitHistoryPenalty"
  >
): number {
  if (
    typeof metrics.deliveryHygieneScore === "number" &&
    Number.isFinite(metrics.deliveryHygieneScore)
  ) {
    return clampScore0to100(metrics.deliveryHygieneScore);
  }
  return 100;
}

export function emptyProductionAuditMetrics(): ProductionAuditMetrics {
  return {
    ...withAliases({
      architecture: 0,
      testing: 0,
      devops: 0,
      resilience: 0,
      productionScore: 0,
    }),
    codeHealthScore: 0,
    deliveryHygieneScore: 100,
    upstreamDerivativePenalty: 0,
    commitHistoryPenalty: 0,
    evidence: {
      inspected: false,
      truncated: false,
      fileCount: 0,
      ciWorkflowCount: 0,
      githubWorkflowCount: 0,
      testFileCount: 0,
      errorBoundaryCount: 0,
      handlerCount: 0,
      architecturePathCount: 0,
      repoKind: "library",
      ciWorkflowPaths: [],
      testPaths: [],
      errorBoundaryPaths: [],
      architecturePaths: [],
      architectureSignals: emptyArchitectureSignals(),
    },
  };
}

/** Standard app scaffolding (tsconfig, src/, lint, framework config) cannot exceed this. */
const ARCHITECTURE_SCAFFOLD_CAP = 82;
/**
 * Route handlers were sampled and do not parse input with Zod `.parse`
 * or an equivalent schema guard.
 */
const ARCHITECTURE_UNVALIDATED_ROUTE_CAP = 72;
/** Sampled source abuses `: any` / `as unknown as` double-casts. */
const ARCHITECTURE_TS_HYGIENE_CAP = 70;
/** tsconfig present but strict/noImplicitAny off or unset. */
const ARCHITECTURE_NON_STRICT_TSCONFIG_CAP = 78;
/** Service-role / secret pattern in a client bundle — P0 Resilience ceiling. */
const RESILIENCE_SERVICE_ROLE_CLIENT_CAP = 25;
/** Supabase SQL sampled with tables but no ENABLE ROW LEVEL SECURITY. */
const RESILIENCE_MISSING_RLS_CAP = 55;
/** RLS enabled in SQL but zero CREATE POLICY statements. */
const RESILIENCE_RLS_NO_POLICY_CAP = 60;
/** Soft ding per unchecked Supabase mutation (insert/update/delete without error check). */
const RESILIENCE_UNCHECKED_MUTATION_PENALTY = 4;
const RESILIENCE_UNCHECKED_MUTATION_CAP = 16;

function hasProvenArchitectureContracts(
  evidence: RepoFilesystemEvidence
): boolean {
  return (
    evidence.route_contracts_sampled === true &&
    evidence.route_schema_validation === true &&
    (evidence.unvalidated_type_assertions ?? 0) === 0 &&
    evidence.has_contract_boundaries === true
  );
}

function routesSampledWithoutSchema(evidence: RepoFilesystemEvidence): boolean {
  return (
    evidence.route_contracts_sampled === true &&
    evidence.route_schema_validation !== true
  );
}

function hasAbusiveTypeScriptHygiene(
  evidence: RepoFilesystemEvidence
): boolean {
  if (evidence.typescript_hygiene_sampled !== true) {
    return false;
  }
  const anyCount = evidence.ts_any_count ?? 0;
  const doubleAssert = evidence.ts_double_assert_count ?? 0;
  const looseAssert = evidence.ts_loose_assert_count ?? 0;
  return anyCount >= 3 || doubleAssert >= 1 || looseAssert >= 5;
}

function hasNonStrictTsconfig(evidence: RepoFilesystemEvidence): boolean {
  return (
    evidence.typescript_hygiene_sampled === true &&
    evidence.tsconfig_strict === false
  );
}

/**
 * Architecture (0-100): structure, type safety, and modularity from the file tree.
 * Scaffolding caps at 82. Sampled route handlers that lack runtime schema
 * validation cap at 72. Abusive `: any` / `as unknown as` caps at 70.
 * Non-strict tsconfig caps at 78. 85+ requires route-level schema validation,
 * zero unvalidated `as Type` assertions, and complete contract boundaries.
 */
export function scoreArchitecture(evidence: RepoFilesystemEvidence): number {
  if (!evidence.inspected) {
    return 0;
  }

  const signals = evidence.architecture_signals ?? emptyArchitectureSignals();
  let score = 0;

  if (evidence.file_count > 0) {
    score += 10;
  }
  if (signals.has_structure) {
    score += 25;
  }
  if (signals.has_workspace) {
    score += 15;
  }
  if (signals.has_type_config) {
    score += 20;
  } else if (signals.has_typed_source) {
    score += 12;
  }
  if (signals.has_declaration) {
    score += 8;
  }
  if (signals.has_manifest) {
    score += 10;
  }
  if (signals.has_framework_config) {
    score += 12;
  }
  if (signals.has_lint) {
    score += 10;
  }
  if (evidence.file_count >= 20 && signals.has_structure) {
    score += 10;
  }

  let raw = clampScore0to100(score);
  if (hasAbusiveTypeScriptHygiene(evidence)) {
    raw = Math.min(raw, ARCHITECTURE_TS_HYGIENE_CAP);
  }
  if (hasNonStrictTsconfig(evidence)) {
    raw = Math.min(raw, ARCHITECTURE_NON_STRICT_TSCONFIG_CAP);
  }
  if (hasProvenArchitectureContracts(evidence)) {
    return raw;
  }
  if (routesSampledWithoutSchema(evidence)) {
    return Math.min(raw, ARCHITECTURE_UNVALIDATED_ROUTE_CAP);
  }
  return Math.min(raw, ARCHITECTURE_SCAFFOLD_CAP);
}

function ciGatesKnown(evidence: RepoFilesystemEvidence): boolean {
  return (
    typeof evidence.ci_has_lint === "boolean" ||
    typeof evidence.ci_has_tests === "boolean" ||
    typeof evidence.ci_has_build === "boolean"
  );
}

function isMonorepoPipeline(evidence: RepoFilesystemEvidence): boolean {
  if (evidence.ci_has_monorepo_pipeline === true) {
    return true;
  }
  const paths = [
    ...evidence.architecture_paths,
    ...evidence.sample_paths,
    ...evidence.ci_workflow_paths,
  ];
  const hasConfig = paths.some((path) =>
    /(^|\/)(turbo\.json|nx\.json|pnpm-workspace\.ya?ml)$/i.test(path)
  );
  const multiStage =
    evidence.ci_depth === "deploy" || evidence.ci_workflow_paths.length >= 2;
  return hasConfig && multiStage;
}

function hasCompileGate(evidence: RepoFilesystemEvidence): boolean {
  return evidence.ci_has_build === true;
}

/**
 * DevOps / CI (0-100): proportional credit from lint/test/build gates
 * aggregated across all inspected workflow bodies.
 * - 90–100: all three gates (deploy / multi-workflow lifts toward 100)
 * - 78–84: two gates
 * - 65–72: one gate
 * - 0–30: workflow files with no detected gates, or no CI at all (0)
 * Monorepo turbo/nx pipelines that are already flagged score 92.
 */
export function scoreDevops(evidence: RepoFilesystemEvidence): number {
  if (!evidence.inspected) {
    return 0;
  }

  const workflows = evidence.ci_workflow_paths.filter(isCiWorkflowPath);
  const depth: CiPipelineDepth =
    evidence.ci_depth ?? (workflows.length === 0 ? "none" : "lint_build");

  if (workflows.length === 0 || depth === "none") {
    return 0;
  }

  if (isMonorepoPipeline(evidence)) {
    return 92;
  }

  const lint = evidence.ci_has_lint === true;
  const tests = evidence.ci_has_tests === true;
  const build = hasCompileGate(evidence);
  const deploy = evidence.ci_has_deploy === true || depth === "deploy";
  const gateCount = Number(lint) + Number(tests) + Number(build);

  // Files present but gates unread or empty — stay in the 0–30 band.
  if (!ciGatesKnown(evidence) || gateCount === 0) {
    if (depth === "tests") {
      return 30;
    }
    if (depth === "deploy") {
      return 28;
    }
    if (depth === "lint_build") {
      return 26;
    }
    return 20;
  }

  if (gateCount === 1) {
    if (tests) {
      return deploy ? 72 : 70;
    }
    if (build) {
      return deploy ? 70 : 68;
    }
    return deploy ? 68 : 65;
  }

  if (gateCount === 2) {
    if (deploy) {
      return 84;
    }
    if (tests && build) {
      return 82;
    }
    if (tests) {
      return 80;
    }
    return 78;
  }

  if (!deploy) {
    return 90;
  }

  const githubWorkflows = workflows.filter(isGithubWorkflowPath);
  return githubWorkflows.length >= 2 || workflows.length >= 2 ? 100 : 95;
}

/** @deprecated Use scoreDevops. */
export function scoreCiCdHealth(evidence: RepoFilesystemEvidence): number {
  return scoreDevops(evidence);
}

/** Full-time volume floor once a repo ships a substantive suite. */
const FULLTIME_VOLUME_FLOOR_MIN_TESTS = 25;
/** Midpoint of the 48–52 floor band for ≥25 verified test files. */
const FULLTIME_VOLUME_FLOOR = 50;
/** Half or more of sampled *.test.ts / *.spec.ts files are hollow. */
const HOLLOW_TEST_SAMPLE_RATIO = 0.5;
const HOLLOW_TEST_TESTING_CAP = 35;

/**
 * Full-Time testing curve: reward absolute suite investment so large apps with
 * dozens of real tests are not crushed by a low test/source ratio.
 * - 0 → 0
 * - 1–5 → 20–35
 * - 6–24 → 35–48
 * - 25+ → floor 50, then scale toward 90+ with route/API/E2E coverage signals
 */
function scoreFulltimeTestingByVolume(
  testFiles: number,
  evidence: RepoFilesystemEvidence,
  ratio: number,
  hasE2e: boolean
): number {
  if (testFiles <= 0) {
    return 0;
  }

  if (testFiles <= 5) {
    const t = (testFiles - 1) / 4;
    return clampScore0to100(Math.round(20 + t * 15));
  }

  if (testFiles < FULLTIME_VOLUME_FLOOR_MIN_TESTS) {
    const t = (testFiles - 6) / 18;
    return clampScore0to100(Math.round(35 + t * 13));
  }

  // 25+: substantive investment floor, then lift on volume + critical path signals.
  let score = FULLTIME_VOLUME_FLOOR;
  score += Math.min(20, Math.floor((testFiles - FULLTIME_VOLUME_FLOOR_MIN_TESTS) / 2));

  if (evidence.route_schema_validation === true) {
    score += 8;
  }
  if (evidence.has_contract_boundaries === true) {
    score += 6;
  }
  if (hasE2e) {
    score += 8;
  }
  // Density still helps; it no longer hard-caps large full-stack trees.
  if (ratio >= 0.15) {
    score += 6;
  } else if (ratio >= 0.1) {
    score += 3;
  }

  if (testFiles >= 50 && hasE2e) {
    score = Math.max(score, 85 + Math.min(10, Math.floor((testFiles - 50) / 10)));
  }

  const ceiling = hasE2e && testFiles >= 50 ? 95 : 90;
  return clampScore0to100(Math.min(Math.max(score, FULLTIME_VOLUME_FLOOR), ceiling));
}

/**
 * Cap only when the inspected sample is mostly hollow. A sample with genuine
 * assertions in more than half of the files is left on the density score.
 * Unsampled suites (count missing or zero) are not penalized.
 */
function applyHollowTestingCap(
  score: number,
  evidence: RepoFilesystemEvidence
): number {
  const sampled = evidence.sampled_test_file_count;
  if (typeof sampled !== "number" || sampled <= 0) {
    return score;
  }
  const hollow =
    typeof evidence.hollow_test_file_count === "number"
      ? evidence.hollow_test_file_count
      : 0;
  if (hollow / sampled < HOLLOW_TEST_SAMPLE_RATIO) {
    return score;
  }
  return Math.min(score, HOLLOW_TEST_TESTING_CAP);
}

/**
 * Testing (0-100). Ratios use core executable *.ts/*.tsx/*.js/*.jsx files only.
 * Demo, sample, tutorial, and docs trees are excluded from the source denominator.
 * Contract: fewer than 10% of those files tested stays under 20; thin large repos
 * (50+ sources, ratio under 0.08) cap at 15; 50+ tests + E2E scores 85–95.
 * Full-time: volume bands (1–5 → 20–35, 6–24 → 35–48, 25+ floors at 50 then
 * scales toward 90+ with route/API/E2E coverage) so large apps with dozens of
 * real suites are not crushed by a low test/source ratio.
 * When at least half of sampled test files are hollow, Testing caps at 35.
 */
export function scoreTesting(
  evidence: RepoFilesystemEvidence,
  auditMode: AuditMode = DEFAULT_AUDIT_MODE
): number {
  if (!evidence.inspected) {
    return 0;
  }

  const mode = normalizeAuditMode(auditMode);
  const testFiles =
    typeof evidence.unit_test_file_count === "number"
      ? evidence.unit_test_file_count
      : evidence.test_paths.filter(isUnitTestFile).length;
  if (testFiles === 0) {
    return 0;
  }

  const executable = evidence.executable_source_count;
  const sourceFiles = Math.max(
    typeof executable === "number" && executable > 0
      ? executable
      : evidence.source_file_count,
    testFiles
  );
  const ratio = testFiles / sourceFiles;
  const hasE2e = evidence.has_e2e_tools === true;

  if (mode === "fulltime") {
    return applyHollowTestingCap(
      scoreFulltimeTestingByVolume(testFiles, evidence, ratio, hasE2e),
      evidence
    );
  }

  if (testFiles >= 50 && hasE2e) {
    const extra = Math.min(10, Math.floor((testFiles - 50) / 10));
    return applyHollowTestingCap(85 + extra, evidence);
  }

  let score: number;
  if (ratio < 0.1) {
    score = Math.min(19, clampScore0to100(Math.round((ratio / 0.1) * 19)));
  } else if (ratio <= 0.3) {
    const t = (ratio - 0.1) / 0.2;
    score = clampScore0to100(Math.round(65 + t * 10));
  } else {
    const extra = Math.min(1, (ratio - 0.3) / 0.2);
    score = hasE2e
      ? clampScore0to100(Math.round(85 + extra * 15))
      : clampScore0to100(Math.round(75 + extra * 10));
  }

  if (sourceFiles > 50 && ratio < 0.08) {
    score = Math.min(score, 15);
  }

  return applyHollowTestingCap(score, evidence);
}

/** @deprecated Use scoreTesting. */
export function scoreTestAssertionDensity(
  evidence: RepoFilesystemEvidence
): number {
  return scoreTesting(evidence);
}

/** Routes that cast payloads with `as Type` and skip schema parsing cannot exceed this. */
const RESILIENCE_UNVALIDATED_ROUTE_CAP = 65;

/** Contract: missing error.tsx is polish — keep a usable floor. */
const CONTRACT_RESILIENCE_STRUCTURE_FLOOR = 50;
const CONTRACT_RESILIENCE_MISSING_BOUNDARY_PENALTY = 15;
/** Full-time: enterprise-grade — no structure floor; missing boundaries hurt. */
const FULLTIME_RESILIENCE_MISSING_BOUNDARY_PENALTY = 30;
/** Small repos: per-incident async ding. */
const RESILIENCE_UNHANDLED_ASYNC_PENALTY = 8;
const RESILIENCE_UNHANDLED_ASYNC_CAP = 24;
/**
 * Large monorepos / high-coverage apps: never wipe resilience for a handful of
 * sample hits (matches forensic-dossier LOC estimate).
 */
const LARGE_REPO_FILE_THRESHOLD = 150;
const LARGE_REPO_LOC_THRESHOLD = 20_000;
const LOC_PER_EXECUTABLE_FILE = 72;
/** Every 1% incident rate → 4 resilience points on large codebases. */
const LARGE_REPO_ASYNC_RATE_SCALE = 4;
/** Soft ceiling when tests are elite or error infra is centralized. */
const RESILIENCE_ASYNC_SOFT_CAP = 12;
const RESILIENCE_ASYNC_SOFT_TEST_FLOOR = 85;

/** Shared error helpers / middleware — not Next.js app/error.tsx boundaries. */
const CENTRALIZED_ERROR_INFRA_PATH =
  /(?:^|\/)(lib\/api\/errors|lib\/[^/]*errors?|api\/errors|utils\/errors?|helpers\/errors?)(\.[cm]?[jt]sx?)?$|(?:^|\/)errors\.(ts|js|tsx|jsx)$|(?:^|\/)middleware\.[cm]?[jt]sx?$|middleware\/.*error/i;

function routesLackSchemaValidation(evidence: RepoFilesystemEvidence): boolean {
  if (evidence.route_contracts_sampled !== true) {
    return false;
  }
  if (evidence.route_schema_validation === true) {
    return false;
  }
  return (evidence.unvalidated_type_assertions ?? 0) > 0 ||
    evidence.route_schema_validation === false;
}

/** Authored LOC estimate (same heuristic as forensic provenance). */
export function estimateAuthoredLoc(evidence: RepoFilesystemEvidence): number {
  const executable =
    typeof evidence.executable_source_count === "number" &&
    evidence.executable_source_count > 0
      ? evidence.executable_source_count
      : evidence.source_file_count;
  return Math.max(0, executable) * LOC_PER_EXECUTABLE_FILE;
}

function isLargeCodebase(evidence: RepoFilesystemEvidence): boolean {
  return (
    evidence.file_count > LARGE_REPO_FILE_THRESHOLD ||
    estimateAuthoredLoc(evidence) > LARGE_REPO_LOC_THRESHOLD
  );
}

function hasCentralizedErrorInfrastructure(
  evidence: RepoFilesystemEvidence
): boolean {
  const paths = [
    ...evidence.error_handling_paths,
    ...(evidence.architecture_paths ?? []),
  ];
  return paths.some((path) => CENTRALIZED_ERROR_INFRA_PATH.test(path));
}

/**
 * Unhandled async/fetch penalty. Small repos use raw counts (−8 each, max −24).
 * Large monorepos (>150 files or >20k authored LOC) use incident rate so 10
 * hits in a 2k-file tree do not look like a systemic outage. Soft-capped at
 * −12 when Testing ≥ 85 or centralized error helpers/middleware are present.
 */
export function unhandledAsyncPenalty(
  evidence: RepoFilesystemEvidence,
  unhandledCount: number,
  testingScore: number
): number {
  const unhandled = Math.max(0, unhandledCount);
  if (unhandled === 0) {
    return 0;
  }

  let penalty: number;
  if (isLargeCodebase(evidence)) {
    const denominator = Math.max(
      evidence.file_count,
      evidence.source_file_count,
      typeof evidence.executable_source_count === "number"
        ? evidence.executable_source_count
        : 0,
      1
    );
    const ratePercent = (unhandled / denominator) * 100;
    penalty = Math.min(
      RESILIENCE_UNHANDLED_ASYNC_CAP,
      Math.round(ratePercent * LARGE_REPO_ASYNC_RATE_SCALE)
    );
    if (penalty === 0) {
      penalty = 1;
    }
  } else {
    penalty = Math.min(
      RESILIENCE_UNHANDLED_ASYNC_CAP,
      unhandled * RESILIENCE_UNHANDLED_ASYNC_PENALTY
    );
  }

  const softCap =
    testingScore >= RESILIENCE_ASYNC_SOFT_TEST_FLOOR ||
    hasCentralizedErrorInfrastructure(evidence);
  if (softCap) {
    penalty = Math.min(penalty, RESILIENCE_ASYNC_SOFT_CAP);
  }

  return penalty;
}

function missingSupabaseRls(evidence: RepoFilesystemEvidence): boolean {
  if (evidence.supabase_hygiene_sampled !== true) {
    return false;
  }
  if (evidence.supabase_sql_sampled !== true) {
    return false;
  }
  if (evidence.supabase_surface_present !== true) {
    return false;
  }
  // Only ding when DDL was observed — empty/comment SQL is not proof of tables.
  if ((evidence.supabase_table_ddl_count ?? 0) <= 0) {
    return false;
  }
  return evidence.supabase_rls_enabled !== true;
}

function supabaseRlsWithoutPolicies(
  evidence: RepoFilesystemEvidence
): boolean {
  if (evidence.supabase_hygiene_sampled !== true) {
    return false;
  }
  if (evidence.supabase_sql_sampled !== true) {
    return false;
  }
  if (evidence.supabase_rls_enabled !== true) {
    return false;
  }
  return (evidence.supabase_policy_count ?? 0) === 0;
}

/**
 * Resilience / security hygiene (0-100): start at 100 and deduct by mode.
 * Contract: missing root error boundaries −15; clean structure floors at ~50.
 * Full-time: missing root error boundaries −30; no softening floors.
 * Unhandled async/fetch: count-based on small repos; rate-based on large ones.
 * Route handlers that use `as Type` without runtime schema parsing cap at 65.
 * Service-role / secret leakage into client bundles hard-caps at 25 (P0).
 * Supabase SQL with tables but no RLS caps at 55; RLS without policies at 60.
 */
export function scoreResilience(
  evidence: RepoFilesystemEvidence,
  repoKind: RepoKind = evidence.repo_kind ?? "library",
  auditMode: AuditMode = DEFAULT_AUDIT_MODE,
  testingScore?: number
): number {
  if (!evidence.inspected) {
    return 0;
  }

  const mode = normalizeAuditMode(auditMode);
  const handlers = evidence.error_handling_paths.filter(isErrorHandlingPath);
  const reactBoundaries = handlers.filter(isReactErrorBoundaryPath);
  const missingBoundaries = reactBoundaries.length === 0;
  const unhandled = Math.max(0, evidence.unhandled_async_count ?? 0);
  const signals = evidence.architecture_signals ?? emptyArchitectureSignals();
  const hasCleanStructure =
    signals.has_structure ||
    signals.has_typed_source ||
    signals.has_type_config ||
    evidence.file_count >= 8;
  const testing =
    typeof testingScore === "number"
      ? clampScore0to100(testingScore)
      : scoreTesting(evidence, mode);

  // P0: client service-role exposure bypasses polish floors.
  if (
    evidence.credential_leak_sampled === true &&
    evidence.service_role_on_client === true
  ) {
    return RESILIENCE_SERVICE_ROLE_CLIENT_CAP;
  }

  let score = 100;
  if (repoKind === "web_app" && missingBoundaries) {
    score -=
      mode === "fulltime"
        ? FULLTIME_RESILIENCE_MISSING_BOUNDARY_PENALTY
        : CONTRACT_RESILIENCE_MISSING_BOUNDARY_PENALTY;
  }
  score -= unhandledAsyncPenalty(evidence, unhandled, testing);
  if (routesLackSchemaValidation(evidence)) {
    score = Math.min(score, RESILIENCE_UNVALIDATED_ROUTE_CAP);
  }

  const uncheckedMutations = Math.max(
    0,
    evidence.supabase_unchecked_mutation_count ?? 0
  );
  if (uncheckedMutations > 0) {
    score -= Math.min(
      RESILIENCE_UNCHECKED_MUTATION_CAP,
      uncheckedMutations * RESILIENCE_UNCHECKED_MUTATION_PENALTY
    );
  }

  // Soft floor is Contract-only — Full-Time keeps the raw enterprise ding.
  if (mode === "contract" && hasCleanStructure) {
    score = Math.max(score, CONTRACT_RESILIENCE_STRUCTURE_FLOOR);
  }

  // RLS caps apply after the contract floor so polish cannot hide missing policies.
  if (missingSupabaseRls(evidence)) {
    score = Math.min(score, RESILIENCE_MISSING_RLS_CAP);
  } else if (supabaseRlsWithoutPolicies(evidence)) {
    score = Math.min(score, RESILIENCE_RLS_NO_POLICY_CAP);
  }

  return clampScore0to100(score);
}

/** @deprecated Use scoreResilience. */
export function scoreErrorBoundaries(evidence: RepoFilesystemEvidence): number {
  return scoreResilience(evidence, evidence.repo_kind ?? "library");
}

export function weightedProductionScore(
  parts: {
    architecture: number;
    testing: number;
    devops: number;
    resilience: number;
  },
  auditMode: AuditMode = DEFAULT_AUDIT_MODE
): number {
  return weightedScoreForMode(auditMode, parts);
}

export const UPSTREAM_DERIVATIVE_PENALTY = 30;
export const UPSTREAM_DERIVATIVE_WARNING =
  "Repository is an upstream fork or generated template.";

/** Subtract 30 from the headline grade when the repo is a fork or template. Floors at 0. */
export function applyUpstreamDerivativePenalty(
  score: number,
  isUpstreamDerivative: boolean
): number {
  if (!isUpstreamDerivative) {
    return clampScore0to100(score);
  }
  return clampScore0to100(score - UPSTREAM_DERIVATIVE_PENALTY);
}

export function computeProductionAuditMetrics(
  evidence: RepoFilesystemEvidence | null | undefined,
  auditMode: AuditMode = DEFAULT_AUDIT_MODE,
  history?: ProductionAuditHistoryInput | null
): ProductionAuditMetrics {
  const mode = normalizeAuditMode(auditMode);
  const normalized = evidence ?? emptyRepoFilesystemEvidence();

  if (!normalized.inspected) {
    return emptyProductionAuditMetrics();
  }

  const repoKind = normalized.repo_kind ?? "library";
  const ciWorkflowPaths = normalized.ci_workflow_paths.filter(isCiWorkflowPath);
  const testPaths = normalized.test_paths.filter(isTestPath);
  const errorBoundaryPaths = normalized.error_handling_paths.filter(
    (path) => isReactErrorBoundaryPath(path) || isErrorHandlingPath(path)
  );
  const architecturePaths = normalized.architecture_paths ?? [];

  const architecture = scoreArchitecture(normalized);
  const testing = scoreTesting(normalized, mode);
  const devops = scoreDevops(normalized);
  const resilience = scoreResilience(normalized, repoKind, mode, testing);
  const weighted = weightedProductionScore(
    {
      architecture,
      testing,
      devops,
      resilience,
    },
    mode
  );

  // Dual-score model: Code Health from AST pillars; Delivery Hygiene is clean
  // (commit-history penalties retired).
  void history;
  const codeHealthScore = weighted;
  const deliveryHygieneScore = 100;
  const commitHistoryPenalty = 0;
  const productionScore = codeHealthScore;

  return {
    ...withAliases(
      {
        architecture,
        testing,
        devops,
        resilience,
        productionScore,
      },
      mode
    ),
    codeHealthScore,
    deliveryHygieneScore,
    upstreamDerivativePenalty: 0,
    commitHistoryPenalty,
    evidence: {
      inspected: true,
      truncated: Boolean(normalized.truncated),
      fileCount: normalized.file_count,
      ciWorkflowCount: ciWorkflowPaths.length,
      githubWorkflowCount: ciWorkflowPaths.filter(isGithubWorkflowPath).length,
      testFileCount: testPaths.length,
      errorBoundaryCount: errorBoundaryPaths.filter(isReactErrorBoundaryPath)
        .length,
      handlerCount: errorBoundaryPaths.length,
      architecturePathCount: architecturePaths.length,
      repoKind,
      ciWorkflowPaths: ciWorkflowPaths.slice(0, 8),
      testPaths: testPaths.slice(0, 8),
      errorBoundaryPaths: errorBoundaryPaths.slice(0, 8),
      architecturePaths: architecturePaths.slice(0, 8),
      architectureSignals:
        normalized.architecture_signals ?? emptyArchitectureSignals(),
    },
  };
}

/**
 * Prefer live file-tree math over any stored/LLM metrics payload.
 * Empty `{ metrics: {} }` objects must not block recomputation.
 */
export function resolveProductionAuditMetrics(input: {
  metrics?: unknown;
  filesystem?: RepoFilesystemEvidence | null;
  auditMode?: AuditMode;
  history?: ProductionAuditHistoryInput | null;
}): ProductionAuditMetrics {
  if (input.filesystem?.inspected) {
    return computeProductionAuditMetrics(
      input.filesystem,
      normalizeAuditMode(input.auditMode),
      input.history
    );
  }

  const parsed = parseProductionAuditMetrics(input.metrics);
  if (parsed?.evidence.inspected) {
    return parsed;
  }

  return emptyProductionAuditMetrics();
}

/** Pull production metrics from a profiles.audit_data blob. */
export function metricsFromPersistedAuditData(
  auditData: unknown
): ProductionAuditMetrics | null {
  if (!auditData || typeof auditData !== "object" || Array.isArray(auditData)) {
    return null;
  }

  const record = auditData as Record<string, unknown>;
  const githubAudit = record.github_audit;
  const filesystem =
    githubAudit &&
    typeof githubAudit === "object" &&
    !Array.isArray(githubAudit)
      ? parseRepoFilesystemEvidence(
          (githubAudit as Record<string, unknown>).filesystem
        )
      : null;

  const resolved = resolveProductionAuditMetrics({
    metrics: record.metrics,
    filesystem,
  });

  return resolved.evidence.inspected ? resolved : null;
}

export function parseProductionAuditMetrics(
  value: unknown
): ProductionAuditMetrics | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const evidenceRecord =
    record.evidence &&
    typeof record.evidence === "object" &&
    !Array.isArray(record.evidence)
      ? (record.evidence as Record<string, unknown>)
      : null;

  const asPaths = (input: unknown): string[] =>
    Array.isArray(input)
      ? input
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 8)
      : [];

  const asCount = (input: unknown): number =>
    typeof input === "number" && Number.isFinite(input)
      ? Math.max(0, Math.round(input))
      : 0;

  const architecture = clampScore0to100(
    record.architecture ?? record.architectureScore
  );
  const testing = clampScore0to100(
    record.testing ?? record.testAssertionDensity
  );
  const devops = clampScore0to100(record.devops ?? record.ciCdHealth);
  const resilience = clampScore0to100(
    record.resilience ?? record.errorBoundaries
  );
  // Commit-history penalties are retired; keep the key for schema compatibility.
  const commitHistoryPenalty = 0;
  const weightedFallback = weightedProductionScore({
    architecture,
    testing,
    devops,
    resilience,
  });
  const storedScore =
    typeof record.productionScore === "number" &&
    Number.isFinite(record.productionScore)
      ? clampScore0to100(record.productionScore)
      : weightedFallback;
  // Legacy blobs omit dual scores — default without renaming stored keys.
  const codeHealthScore =
    typeof record.codeHealthScore === "number" &&
    Number.isFinite(record.codeHealthScore)
      ? clampScore0to100(record.codeHealthScore)
      : storedScore;
  const deliveryHygieneScore =
    typeof record.deliveryHygieneScore === "number" &&
    Number.isFinite(record.deliveryHygieneScore)
      ? clampScore0to100(record.deliveryHygieneScore)
      : 100;

  const storedKind = evidenceRecord?.repoKind;
  const repoKind: RepoKind =
    storedKind === "web_app" || storedKind === "library"
      ? storedKind
      : "library";

  const storedSignals =
    evidenceRecord?.architectureSignals &&
    typeof evidenceRecord.architectureSignals === "object" &&
    !Array.isArray(evidenceRecord.architectureSignals)
      ? (evidenceRecord.architectureSignals as Record<string, unknown>)
      : null;

  return {
    ...withAliases({
      architecture,
      testing,
      devops,
      resilience,
      // Preserve stored headline when present so legacy consumers stay stable.
      productionScore: storedScore,
    }),
    codeHealthScore,
    deliveryHygieneScore,
    upstreamDerivativePenalty:
      asCount(record.upstreamDerivativePenalty) > 0
        ? UPSTREAM_DERIVATIVE_PENALTY
        : 0,
    commitHistoryPenalty,
    evidence: {
      inspected: evidenceRecord?.inspected === true,
      truncated: evidenceRecord?.truncated === true,
      fileCount: asCount(evidenceRecord?.fileCount),
      ciWorkflowCount: asCount(evidenceRecord?.ciWorkflowCount),
      githubWorkflowCount: asCount(evidenceRecord?.githubWorkflowCount),
      testFileCount: asCount(evidenceRecord?.testFileCount),
      errorBoundaryCount: asCount(evidenceRecord?.errorBoundaryCount),
      handlerCount: asCount(evidenceRecord?.handlerCount),
      architecturePathCount: asCount(evidenceRecord?.architecturePathCount),
      repoKind,
      ciWorkflowPaths: asPaths(evidenceRecord?.ciWorkflowPaths),
      testPaths: asPaths(evidenceRecord?.testPaths),
      errorBoundaryPaths: asPaths(evidenceRecord?.errorBoundaryPaths),
      architecturePaths: asPaths(evidenceRecord?.architecturePaths),
      architectureSignals: storedSignals
        ? {
            has_type_config: storedSignals.has_type_config === true,
            has_typed_source: storedSignals.has_typed_source === true,
            has_declaration: storedSignals.has_declaration === true,
            has_structure: storedSignals.has_structure === true,
            has_workspace: storedSignals.has_workspace === true,
            has_manifest: storedSignals.has_manifest === true,
            has_framework_config: storedSignals.has_framework_config === true,
            has_lint: storedSignals.has_lint === true,
          }
        : emptyArchitectureSignals(),
    },
  };
}
