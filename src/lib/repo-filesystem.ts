import { clampScore0to100 } from "@/lib/score-scale";

/** Harsh ceilings when a repo has no quality signals (messy / untyped). */
export const MISSING_CORE_ARTIFACT_SCORE_CAP = 60;
export const UNINSPECTED_OR_MULTIPLE_MISSING_SCORE_CAP = 50;
export const HIGH_SCORE_FILESYSTEM_PROOF_FLOOR = 81;

/**
 * Soft per-artifact penalties for otherwise clean repos (TypeScript, lint,
 * modular layout, schema validation, or route handlers). Used for both the
 * filesystem score ceiling and the Remediation Simulator uplift.
 */
export const MISSING_ARTIFACT_PENALTIES = {
  ci: 15,
  tests: 14,
  error_handling: 12,
} as const;

/** @deprecated Prefer MISSING_ARTIFACT_PENALTIES — kept as the CI soft penalty. */
export const MISSING_CI_SOFT_PENALTY = MISSING_ARTIFACT_PENALTIES.ci;

export const ARTIFACT_REMEDIATION_POINTS = {
  ci: MISSING_ARTIFACT_PENALTIES.ci,
  tests: MISSING_ARTIFACT_PENALTIES.tests,
  error_handling: MISSING_ARTIFACT_PENALTIES.error_handling,
} as const;

export type CoreArtifactKind = "tests" | "ci" | "error_handling";

export type RepoQualitySignals = {
  typescript: boolean;
  linting: boolean;
  schemaValidation: boolean;
  routeHandlers: boolean;
  modularStructure: boolean;
};

export type RepoFilesystemEvidence = {
  inspected: boolean;
  truncated: boolean;
  file_count: number;
  sample_paths: string[];
  test_paths: string[];
  ci_workflow_paths: string[];
  error_handling_paths: string[];
  quality_signals: RepoQualitySignals;
};

export type FilesystemScorePolicy = {
  proseNeverOverridesMissingFiles: true;
  missingCoreArtifactMaxScore: number;
  multipleMissingOrUninspectedMaxScore: number;
  scoreAbove80RequiresFilesystemProof: true;
  highScoreFloor: typeof HIGH_SCORE_FILESYSTEM_PROOF_FLOOR;
  inspected: boolean;
  hasQualitySignals: boolean;
  softPenalties: typeof MISSING_ARTIFACT_PENALTIES;
  coreArtifacts: {
    tests: boolean;
    ci: boolean;
    error_handling: boolean;
  };
  missingCoreArtifacts: CoreArtifactKind[];
  appliedMaxScore: number;
};

export type ScoreDeductionCode =
  | "uninspected_file_tree"
  | "missing_tests"
  | "missing_ci"
  | "missing_error_handling";

export type ScoreDeduction = {
  code: ScoreDeductionCode;
  artifact: CoreArtifactKind | null;
  label: string;
  detail: string;
  points: number;
};

export type ScoreCapAudit = {
  applied: boolean;
  clipped: boolean;
  inspected: boolean;
  uncappedScore: number;
  cappedScore: number;
  ceiling: number;
  pointsDeducted: number;
  missingCoreArtifacts: CoreArtifactKind[];
  coreArtifacts: {
    tests: boolean;
    ci: boolean;
    error_handling: boolean;
  };
  deductions: ScoreDeduction[];
  summary: string;
};

const MAX_PATHS_PER_BUCKET = 16;
const MAX_SAMPLE_PATHS = 20;

const NOISE_PATH =
  /(^|\/)(node_modules|dist|build|out|\.next|coverage|vendor|\.git|__pycache__|\.venv|venv)(\/|$)/i;

const TEST_DIR =
  /(^|\/)(__tests?__|tests?|spec|e2e|cypress|testing|playwright)(\/|$)/i;
const TEST_FILE = /\.(tests?|spec|cy)\.[cm]?[jt]sx?$/i;
const TEST_BASENAME = /(^|\/)(tests?|spec)\.[cm]?[jt]sx?$/i;
const TEST_GO = /_test\.go$/i;
const TEST_PY = /(^|\/)test_[^/]+\.py$|_test\.py$/i;
const TEST_RUBY = /(_spec|_test)\.rb$/i;
const TEST_RUST = /_test\.rs$/i;
const TEST_ELIXIR = /_test\.exs?$/i;
const TEST_JVM = /.+Tests?\.(java|kt|groovy)$/i;
const TEST_SWIFT = /.+Tests\.swift$/i;
const TEST_DART = /(_test|\.test)\.dart$/i;
const TEST_DOTNET = /Tests?\.cs$/i;
const TEST_CONFIG =
  /(^|\/)(jest\.config|jest\.setup|vitest\.config|vitest\.workspace|karma\.conf|pytest\.ini|phpunit\.xml|cypress\.config|playwright\.config|ava\.config|\.mocharc|mocha\.opts|wdio\.conf|nightwatch\.conf|web-test-runner\.config|jasmine\.json|conftest\.py|tox\.ini|pest\.php|\.rspec|setupTests\.|setup-tests\.)/i;

const CI_PATH =
  /(^|\/)(\.github\/workflows\/[^/]+\.ya?ml$|\.gitlab-ci\.ya?ml$|Jenkinsfile$|\.circleci\/|azure-pipelines\.ya?ml$|\.travis\.ya?ml$|bitbucket-pipelines\.ya?ml$|\.buildkite\/|appveyor\.ya?ml$|\.?drone\.ya?ml$|cloudbuild\.ya?ml$|\.?woodpecker\.ya?ml$)/i;

export const WORKSPACE_ROOT_DIRS = [
  "packages",
  "apps",
  "services",
  "libs",
  "modules",
  "workspaces",
] as const;

export const CORE_ARTIFACT_PROBE_DIRS = [
  ".github/workflows",
  "tests",
  "test",
  "__tests__",
  "__test__",
  "spec",
  "e2e",
  "cypress",
  "testing",
  "src/test",
  "src/tests",
  "src/__tests__",
] as const;

const WORKSPACE_PACKAGE_PREFIX =
  /^(packages|apps|services|libs|modules|workspaces)\/[^/]+/i;

const ERROR_HANDLING_PATH =
  /(error[-_]?boundar|error[-_]?handler|exception[-_]?handler|(^|\/)global-error\.[cm]?[jt]sx?$|(^|\/)error\.[cm]?[jt]sx?$|(^|\/)errors?\.(ts|js|tsx|jsx|py|go)$|(^|\/)errors\/|middleware\/.*error)/i;

const TSCONFIG_PATH = /(^|\/)tsconfig(\.[^/]+)?\.json$/i;
const TYPESCRIPT_SOURCE = /\.[cm]?tsx?$/i;
const LINT_CONFIG_PATH =
  /(^|\/)(eslint\.config\.[cm]?[jt]sx?$|\.eslintrc(\.|$)|biome\.jsonc?$|\.biome\.jsonc?$|\.prettierrc(\.|$)|prettier\.config\.[cm]?[jt]s$)/i;
const SCHEMA_VALIDATION_PATH =
  /(^|\/)(schemas?|validators?|validations?)\/|\.schema\.[cm]?[jt]sx?$|(^|\/)zod[^/]*\.[cm]?[jt]sx?$|[-_.]zod\.[cm]?[jt]sx?$/i;
const ROUTE_HANDLER_PATH = /(^|\/)route\.[cm]?[jt]sx?$/i;
const MODULAR_SRC = /(^|\/)src\//;
const MODULAR_LAYOUT =
  /(^|\/)(app|lib|components|packages|modules|features|hooks|utils)\//;

function asStringPaths(value: unknown, limit = MAX_PATHS_PER_BUCKET): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function emptyQualitySignals(): RepoQualitySignals {
  return {
    typescript: false,
    linting: false,
    schemaValidation: false,
    routeHandlers: false,
    modularStructure: false,
  };
}

export function emptyRepoFilesystemEvidence(): RepoFilesystemEvidence {
  return {
    inspected: false,
    truncated: false,
    file_count: 0,
    sample_paths: [],
    test_paths: [],
    ci_workflow_paths: [],
    error_handling_paths: [],
    quality_signals: emptyQualitySignals(),
  };
}

export function detectQualitySignals(paths: string[]): RepoQualitySignals {
  const clean = paths
    .map((path) => path.trim().replace(/\\/g, "/"))
    .filter((path) => path && !isNoisePath(path));

  let typescriptSources = 0;
  let hasTsconfig = false;
  let linting = false;
  let schemaValidation = false;
  let routeHandlers = false;
  let hasSrc = false;
  let hasLayout = false;

  for (const path of clean) {
    if (TSCONFIG_PATH.test(path)) {
      hasTsconfig = true;
    }
    if (TYPESCRIPT_SOURCE.test(path)) {
      typescriptSources += 1;
    }
    if (LINT_CONFIG_PATH.test(path)) {
      linting = true;
    }
    if (SCHEMA_VALIDATION_PATH.test(path)) {
      schemaValidation = true;
    }
    if (ROUTE_HANDLER_PATH.test(path)) {
      routeHandlers = true;
    }
    if (MODULAR_SRC.test(path)) {
      hasSrc = true;
    }
    if (MODULAR_LAYOUT.test(path)) {
      hasLayout = true;
    }
  }

  return {
    typescript: hasTsconfig || typescriptSources >= 5,
    linting,
    schemaValidation,
    routeHandlers,
    modularStructure: hasSrc && hasLayout && clean.length >= 12,
  };
}

export function hasRepoQualitySignals(
  signals: RepoQualitySignals | null | undefined
): boolean {
  if (!signals) {
    return false;
  }
  return (
    signals.typescript ||
    signals.linting ||
    signals.schemaValidation ||
    signals.routeHandlers ||
    signals.modularStructure
  );
}

/** Strong enough signals to award error-handling / test baseline floors. */
export function hasStrongQualitySignals(
  signals: RepoQualitySignals | null | undefined
): boolean {
  if (!signals) {
    return false;
  }
  if (signals.typescript && (signals.linting || signals.modularStructure)) {
    return true;
  }
  if (
    signals.typescript &&
    (signals.schemaValidation || signals.routeHandlers)
  ) {
    return true;
  }
  return false;
}

export function parseQualitySignals(value: unknown): RepoQualitySignals {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyQualitySignals();
  }
  const record = value as Record<string, unknown>;
  return {
    typescript: record.typescript === true,
    linting: record.linting === true,
    schemaValidation: record.schemaValidation === true,
    routeHandlers: record.routeHandlers === true,
    modularStructure: record.modularStructure === true,
  };
}

export function isNoisePath(path: string): boolean {
  return NOISE_PATH.test(path);
}

export function isTestConfigPath(path: string): boolean {
  return TEST_CONFIG.test(path);
}

export function isSmokeOrE2eTestPath(path: string): boolean {
  return /(^|\/)(e2e|smoke)(\/|$)|smoke|playwright|cypress/i.test(path);
}

export function isTestPath(path: string): boolean {
  if (isNoisePath(path)) {
    return false;
  }

  return (
    TEST_DIR.test(path) ||
    TEST_FILE.test(path) ||
    TEST_BASENAME.test(path) ||
    TEST_GO.test(path) ||
    TEST_PY.test(path) ||
    TEST_RUBY.test(path) ||
    TEST_RUST.test(path) ||
    TEST_ELIXIR.test(path) ||
    TEST_JVM.test(path) ||
    TEST_SWIFT.test(path) ||
    TEST_DART.test(path) ||
    TEST_DOTNET.test(path) ||
    TEST_CONFIG.test(path)
  );
}

export function discoverWorkspacePackageDirs(
  paths: string[],
  limit = 12
): string[] {
  const packages = new Set<string>();

  for (const raw of paths) {
    const match = raw.trim().replace(/\\/g, "/").match(WORKSPACE_PACKAGE_PREFIX);
    if (!match) {
      continue;
    }

    packages.add(match[0]);
    if (packages.size >= limit) {
      break;
    }
  }

  return Array.from(packages);
}

export function isCiWorkflowPath(path: string): boolean {
  if (isNoisePath(path)) {
    return false;
  }

  return CI_PATH.test(path);
}

export function isErrorHandlingPath(path: string): boolean {
  if (isNoisePath(path)) {
    return false;
  }

  return ERROR_HANDLING_PATH.test(path);
}

export function classifyRepoFilesystem(
  paths: string[],
  options?: { truncated?: boolean; inspected?: boolean }
): RepoFilesystemEvidence {
  const unique = Array.from(
    new Set(paths.map((path) => path.trim()).filter(Boolean))
  ).filter((path) => !isNoisePath(path));

  return {
    inspected: options?.inspected ?? unique.length > 0,
    truncated: Boolean(options?.truncated),
    file_count: unique.length,
    sample_paths: unique.slice(0, MAX_SAMPLE_PATHS),
    test_paths: unique.filter(isTestPath).slice(0, MAX_PATHS_PER_BUCKET),
    ci_workflow_paths: unique
      .filter(isCiWorkflowPath)
      .slice(0, MAX_PATHS_PER_BUCKET),
    error_handling_paths: unique
      .filter(isErrorHandlingPath)
      .slice(0, MAX_PATHS_PER_BUCKET),
    quality_signals: detectQualitySignals(unique),
  };
}

export function parseRepoFilesystemEvidence(
  value: unknown
): RepoFilesystemEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyRepoFilesystemEvidence();
  }

  const record = value as Record<string, unknown>;
  const inspected = record.inspected === true;
  const fileCount =
    typeof record.file_count === "number" && Number.isFinite(record.file_count)
      ? Math.max(0, Math.round(record.file_count))
      : 0;

  const samplePaths = asStringPaths(record.sample_paths, MAX_SAMPLE_PATHS);
  const testPaths = asStringPaths(record.test_paths);
  const ciPaths = asStringPaths(record.ci_workflow_paths);
  const errorPaths = asStringPaths(record.error_handling_paths);
  const parsedSignals = parseQualitySignals(record.quality_signals);
  const inferredSignals = hasRepoQualitySignals(parsedSignals)
    ? parsedSignals
    : detectQualitySignals([
        ...samplePaths,
        ...testPaths,
        ...ciPaths,
        ...errorPaths,
      ]);

  return {
    inspected,
    truncated: record.truncated === true,
    file_count: fileCount,
    sample_paths: samplePaths,
    test_paths: testPaths,
    ci_workflow_paths: ciPaths,
    error_handling_paths: errorPaths,
    quality_signals: inferredSignals,
  };
}

export function coreArtifactsPresent(evidence: RepoFilesystemEvidence | null | undefined): {
  tests: boolean;
  ci: boolean;
  error_handling: boolean;
} {
  return {
    tests: (evidence?.test_paths.length ?? 0) > 0,
    ci: (evidence?.ci_workflow_paths.length ?? 0) > 0,
    error_handling: (evidence?.error_handling_paths.length ?? 0) > 0,
  };
}

export function missingCoreArtifacts(
  evidence: RepoFilesystemEvidence | null | undefined
): CoreArtifactKind[] {
  if (!evidence?.inspected) {
    return ["tests", "ci", "error_handling"];
  }

  const present = coreArtifactsPresent(evidence);
  const missing: CoreArtifactKind[] = [];
  if (!present.tests) {
    missing.push("tests");
  }
  if (!present.ci) {
    missing.push("ci");
  }
  if (!present.error_handling) {
    missing.push("error_handling");
  }
  return missing;
}

export function softPenaltyForMissing(missing: CoreArtifactKind[]): number {
  return missing.reduce(
    (sum, kind) => sum + MISSING_ARTIFACT_PENALTIES[kind],
    0
  );
}

export function filesystemScoreCeiling(
  evidence: RepoFilesystemEvidence | null | undefined
): number {
  if (!evidence?.inspected) {
    return UNINSPECTED_OR_MULTIPLE_MISSING_SCORE_CAP;
  }

  const missing = missingCoreArtifacts(evidence);
  if (missing.length === 0) {
    return 100;
  }

  const quality = hasRepoQualitySignals(evidence.quality_signals);
  if (!quality) {
    return missing.length >= 2
      ? UNINSPECTED_OR_MULTIPLE_MISSING_SCORE_CAP
      : MISSING_CORE_ARTIFACT_SCORE_CAP;
  }

  // Clean repos: capped soft penalties (−10 to −15 per missing pillar).
  return clampScore0to100(100 - softPenaltyForMissing(missing));
}

export function capScoreForFilesystemEvidence(
  score: unknown,
  evidence: RepoFilesystemEvidence | null | undefined
): number {
  return Math.min(clampScore0to100(score), filesystemScoreCeiling(evidence));
}

export function hasFilesystemProofForHighScore(
  evidence: RepoFilesystemEvidence | null | undefined
): boolean {
  return filesystemScoreCeiling(evidence) === 100;
}

export function strongestFilesystemEvidence(
  artifacts: Array<{ filesystem?: RepoFilesystemEvidence | null } | null | undefined>
): RepoFilesystemEvidence | null {
  const inspected = artifacts
    .map((artifact) => artifact?.filesystem)
    .filter((evidence): evidence is RepoFilesystemEvidence =>
      Boolean(evidence?.inspected)
    );

  if (inspected.length === 0) {
    return artifacts.find((artifact) => artifact?.filesystem)?.filesystem ?? null;
  }

  return [...inspected].sort((left, right) => {
    const missingDelta =
      missingCoreArtifacts(left).length - missingCoreArtifacts(right).length;
    if (missingDelta !== 0) {
      return missingDelta;
    }
    return right.file_count - left.file_count;
  })[0];
}

export function buildFilesystemScorePolicy(
  evidence: RepoFilesystemEvidence | null | undefined
): FilesystemScorePolicy {
  const coreArtifacts = coreArtifactsPresent(
    evidence?.inspected ? evidence : emptyRepoFilesystemEvidence()
  );
  if (!evidence?.inspected) {
    coreArtifacts.tests = false;
    coreArtifacts.ci = false;
    coreArtifacts.error_handling = false;
  }

  const quality = hasRepoQualitySignals(evidence?.quality_signals);
  const softCeiling = clampScore0to100(
    100 - softPenaltyForMissing(["ci", "tests", "error_handling"])
  );

  return {
    proseNeverOverridesMissingFiles: true,
    missingCoreArtifactMaxScore: quality
      ? clampScore0to100(100 - MISSING_ARTIFACT_PENALTIES.ci)
      : MISSING_CORE_ARTIFACT_SCORE_CAP,
    multipleMissingOrUninspectedMaxScore: quality
      ? softCeiling
      : UNINSPECTED_OR_MULTIPLE_MISSING_SCORE_CAP,
    scoreAbove80RequiresFilesystemProof: true,
    highScoreFloor: HIGH_SCORE_FILESYSTEM_PROOF_FLOOR,
    inspected: Boolean(evidence?.inspected),
    hasQualitySignals: quality,
    softPenalties: { ...MISSING_ARTIFACT_PENALTIES },
    coreArtifacts,
    missingCoreArtifacts: missingCoreArtifacts(evidence),
    appliedMaxScore: filesystemScoreCeiling(evidence),
  };
}

export function compactFilesystemForPrompt(
  evidence: RepoFilesystemEvidence | null | undefined
): RepoFilesystemEvidence & {
  missing_core_artifacts: CoreArtifactKind[];
} {
  const normalized = evidence ?? emptyRepoFilesystemEvidence();
  return {
    ...normalized,
    missing_core_artifacts: missingCoreArtifacts(normalized),
  };
}

const CORE_ARTIFACT_LABELS: Record<CoreArtifactKind, string> = {
  tests: "a test suite",
  ci: "CI workflows",
  error_handling: "explicit error-handling files",
};

const DEDUCTION_META: Record<
  ScoreDeductionCode,
  { artifact: CoreArtifactKind | null; label: string; detail: string }
> = {
  uninspected_file_tree: {
    artifact: null,
    label: "Repository file tree not inspected",
    detail:
      "GitHub file-tree inspection did not produce a path list, so tests, CI/CD, and error handling could not be verified as code artifacts. README, resume, and project write-ups cannot substitute.",
  },
  missing_ci: {
    artifact: "ci",
    label: "Missing CI/CD workflows",
    detail:
      "No CI/CD workflow files were found (.github/workflows, GitLab CI, Jenkins, CircleCI, Azure Pipelines, Travis, Buildkite, Drone, or Cloud Build). On clean TypeScript repos this is a capped soft penalty, not an instant zero. README claims of CI do not count.",
  },
  missing_error_handling: {
    artifact: "error_handling",
    label: "Missing error-handling files",
    detail:
      "No explicit error-handling files were found (error boundaries, error/exception handlers, or errors modules). Clean TypeScript / schema-validated repos still receive a baseline floor; prose descriptions do not count.",
  },
  missing_tests: {
    artifact: "tests",
    label: "Missing test suite",
    detail:
      "No test files, nested package test dirs, or test-runner config were found in the inspected file tree (Jest, Vitest, Ava, Mocha, Pytest, Go test, Playwright, Cypress, and similar all count). Strict TypeScript / lint configs can earn partial credit; README claims of tests do not count.",
  },
};

const DEDUCTION_CODE_BY_ARTIFACT: Record<CoreArtifactKind, ScoreDeductionCode> = {
  tests: "missing_tests",
  ci: "missing_ci",
  error_handling: "missing_error_handling",
};

function splitPoints(total: number, count: number): number[] {
  if (count <= 0) {
    return [];
  }

  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from(
    { length: count },
    (_, index) => base + (index < remainder ? 1 : 0)
  );
}

function deductionCodesForEvidence(
  evidence: RepoFilesystemEvidence | null | undefined
): ScoreDeductionCode[] {
  if (!evidence?.inspected) {
    return ["uninspected_file_tree"];
  }

  return missingCoreArtifacts(evidence).map(
    (kind) => DEDUCTION_CODE_BY_ARTIFACT[kind]
  );
}

export function emptyScoreCapAudit(score: number): ScoreCapAudit {
  const clamped = clampScore0to100(score);
  return {
    applied: false,
    clipped: false,
    inspected: true,
    uncappedScore: clamped,
    cappedScore: clamped,
    ceiling: 100,
    pointsDeducted: 0,
    missingCoreArtifacts: [],
    coreArtifacts: { tests: true, ci: true, error_handling: true },
    deductions: [],
    summary: "",
  };
}

export function buildScoreCapAudit(
  uncappedScore: unknown,
  evidence: RepoFilesystemEvidence | null | undefined
): ScoreCapAudit {
  const uncapped = clampScore0to100(uncappedScore);
  const ceiling = filesystemScoreCeiling(evidence);
  const capped = Math.min(uncapped, ceiling);
  const pointsDeducted = Math.max(0, uncapped - capped);
  const applied = ceiling < 100;
  const inspected = Boolean(evidence?.inspected);
  const missing = missingCoreArtifacts(evidence);
  const coreArtifacts = coreArtifactsPresent(
    inspected ? evidence : emptyRepoFilesystemEvidence()
  );
  if (!inspected) {
    coreArtifacts.tests = false;
    coreArtifacts.ci = false;
    coreArtifacts.error_handling = false;
  }

  if (!applied) {
    return {
      ...emptyScoreCapAudit(uncapped),
      inspected,
      uncappedScore: uncapped,
      cappedScore: capped,
      coreArtifacts,
    };
  }

  const codes = deductionCodesForEvidence(evidence);
  const withheld = 100 - ceiling;
  const allocated = pointsDeducted > 0 ? pointsDeducted : withheld;
  const shares = splitPoints(allocated, codes.length);
  const deductions = codes.map((code, index) => {
    const meta = DEDUCTION_META[code];
    return {
      code,
      artifact: meta.artifact,
      label: meta.label,
      detail: meta.detail,
      points: shares[index] ?? 0,
    };
  });

  const summary = inspected
    ? pointsDeducted > 0
      ? `Score capped at ${ceiling}: ${uncapped} reduced to ${capped} (−${pointsDeducted}) because the file tree is missing ${missing
          .map((kind) => CORE_ARTIFACT_LABELS[kind])
          .join(", ")}. Prose descriptions do not count.`
      : `Score capped at ${ceiling}: file tree is missing ${missing
          .map((kind) => CORE_ARTIFACT_LABELS[kind])
          .join(", ")}. README and write-ups cannot raise this ceiling.`
    : pointsDeducted > 0
      ? `Score capped at ${ceiling}: ${uncapped} reduced to ${capped} (−${pointsDeducted}) because the repository file tree was not inspected.`
      : `Score capped at ${ceiling}: repository file tree was not inspected, so tests, CI/CD, and error handling were not verified as code artifacts.`;

  return {
    applied: true,
    clipped: pointsDeducted > 0,
    inspected,
    uncappedScore: uncapped,
    cappedScore: capped,
    ceiling,
    pointsDeducted,
    missingCoreArtifacts: missing,
    coreArtifacts,
    deductions,
    summary,
  };
}

export function parseScoreCapAudit(value: unknown): ScoreCapAudit | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.deductions)) {
    return null;
  }

  const deductions = record.deductions
    .map((item): ScoreDeduction | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const row = item as Record<string, unknown>;
      const code = row.code;
      if (
        code !== "uninspected_file_tree" &&
        code !== "missing_tests" &&
        code !== "missing_ci" &&
        code !== "missing_error_handling"
      ) {
        return null;
      }
      const meta = DEDUCTION_META[code];
      const points =
        typeof row.points === "number" && Number.isFinite(row.points)
          ? Math.max(0, Math.round(row.points))
          : 0;
      return {
        code,
        artifact: meta.artifact,
        label:
          typeof row.label === "string" && row.label.trim()
            ? row.label.trim()
            : meta.label,
        detail:
          typeof row.detail === "string" && row.detail.trim()
            ? row.detail.trim()
            : meta.detail,
        points,
      };
    })
    .filter((item): item is ScoreDeduction => item !== null);

  const uncapped = clampScore0to100(record.uncappedScore);
  const ceiling = clampScore0to100(record.ceiling ?? 100);
  const capped = clampScore0to100(record.cappedScore ?? uncapped);
  const pointsDeducted =
    typeof record.pointsDeducted === "number" &&
    Number.isFinite(record.pointsDeducted)
      ? Math.max(0, Math.round(record.pointsDeducted))
      : Math.max(0, uncapped - capped);

  const coreFromRecord =
    record.coreArtifacts &&
    typeof record.coreArtifacts === "object" &&
    !Array.isArray(record.coreArtifacts)
      ? (record.coreArtifacts as Record<string, unknown>)
      : null;

  const missing = Array.isArray(record.missingCoreArtifacts)
    ? record.missingCoreArtifacts.filter(
        (item): item is CoreArtifactKind =>
          item === "tests" || item === "ci" || item === "error_handling"
      )
    : [];

  return {
    applied: record.applied === true || ceiling < 100 || deductions.length > 0,
    clipped: record.clipped === true || pointsDeducted > 0,
    inspected: record.inspected === true,
    uncappedScore: uncapped,
    cappedScore: capped,
    ceiling,
    pointsDeducted,
    missingCoreArtifacts: missing,
    coreArtifacts: {
      tests: coreFromRecord?.tests === true,
      ci: coreFromRecord?.ci === true,
      error_handling: coreFromRecord?.error_handling === true,
    },
    deductions,
    summary:
      typeof record.summary === "string" ? record.summary.trim() : "",
  };
}

export function resolveScoreCapAudit(
  score: unknown,
  scoreCap: unknown,
  evidence?: RepoFilesystemEvidence | null
): ScoreCapAudit | null {
  const parsed = parseScoreCapAudit(scoreCap);
  if (parsed?.applied) {
    return parsed;
  }

  if (evidence) {
    const rebuilt = buildScoreCapAudit(score, evidence);
    return rebuilt.applied ? rebuilt : null;
  }

  return parsed?.applied ? parsed : null;
}

export function isFilesystemCapRedFlag(flag: string): boolean {
  return /^Score capped at \d+/.test(flag.trim());
}

export function filesystemCapRedFlag(
  ceiling: number,
  evidence: RepoFilesystemEvidence | null | undefined
): string {
  if (!evidence?.inspected) {
    return `Score capped at ${ceiling}: repo inspection did not produce a file tree. README, resume, and project write-ups cannot substitute for test suites, CI workflows, or error-handling files.`;
  }

  const missing = missingCoreArtifacts(evidence)
    .map((kind) => CORE_ARTIFACT_LABELS[kind])
    .join(", ");

  return `Score capped at ${ceiling}: repo file tree is missing ${missing}. Prose descriptions of those capabilities do not count.`;
}

export function applyFilesystemScoreCap<
  T extends { score: number; redFlags: string[] },
>(
  result: T,
  evidence: RepoFilesystemEvidence | null | undefined,
  maxFlags = 5
): T & { scoreCap: ScoreCapAudit } {
  const scoreCap = buildScoreCapAudit(result.score, evidence);
  const next = {
    ...result,
    score: scoreCap.cappedScore,
    scoreCap,
  };

  if (!scoreCap.applied) {
    return next;
  }

  const flag = filesystemCapRedFlag(scoreCap.ceiling, evidence);
  return {
    ...next,
    redFlags: [flag, ...result.redFlags.filter((item) => item !== flag)].slice(
      0,
      maxFlags
    ),
  };
}
