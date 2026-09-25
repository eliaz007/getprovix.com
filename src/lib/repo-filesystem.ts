import { clampScore0to100 } from "@/lib/score-scale";

/** @deprecated Hard 60/50 caps are no longer applied. Kept so leftover prompt interpolations stay harmless. */
export const MISSING_CORE_ARTIFACT_SCORE_CAP = 100;
export const UNINSPECTED_OR_MULTIPLE_MISSING_SCORE_CAP = 100;
export const HIGH_SCORE_FILESYSTEM_PROOF_FLOOR = 0;

export type CoreArtifactKind = "tests" | "ci" | "error_handling";

/** Client web shell vs library / backend / package. */
export type RepoKind = "web_app" | "library";

export type CiPipelineDepth = "none" | "lint_build" | "tests" | "deploy";

export type ArchitectureSignals = {
  has_type_config: boolean;
  has_typed_source: boolean;
  has_declaration: boolean;
  has_structure: boolean;
  has_workspace: boolean;
  has_manifest: boolean;
  has_framework_config: boolean;
  has_lint: boolean;
};

export type RepoFilesystemEvidence = {
  inspected: boolean;
  truncated: boolean;
  file_count: number;
  sample_paths: string[];
  test_paths: string[];
  ci_workflow_paths: string[];
  error_handling_paths: string[];
  architecture_paths: string[];
  architecture_signals: ArchitectureSignals;
  repo_kind: RepoKind;
  source_file_count: number;
  unit_test_file_count: number;
  has_e2e_tools: boolean;
  /** *.ts/*.tsx/*.js/*.jsx source files, excluding tests and *.d.ts. */
  executable_source_count: number;
  ci_depth: CiPipelineDepth;
  unhandled_async_count: number;
  resilience_sampled: boolean;
  /** Set after workflow file contents are read. Unknown when omitted. */
  ci_has_lint?: boolean;
  ci_has_tests?: boolean;
  ci_has_build?: boolean;
  ci_has_deploy?: boolean;
  ci_has_monorepo_pipeline?: boolean;
  /** True once API route handler source was read. */
  route_contracts_sampled?: boolean;
  /** Every sampled route parses input with a runtime schema (Zod or equivalent). */
  route_schema_validation?: boolean;
  /** `as Type` assertions in sampled route handlers. */
  unvalidated_type_assertions?: number;
  /** Every sampled route has a schema contract and zero bare type assertions. */
  has_contract_boundaries?: boolean;
};

export type FilesystemScorePolicy = {
  proseNeverOverridesMissingFiles: true;
  scoringModel: "four_pillar";
  repoKind: RepoKind;
  weights: {
    architecture: 0.35;
    testing: 0.25;
    devops: 0.2;
    resilience: 0.2;
  };
  missingCoreArtifactMaxScore: typeof MISSING_CORE_ARTIFACT_SCORE_CAP;
  multipleMissingOrUninspectedMaxScore: typeof UNINSPECTED_OR_MULTIPLE_MISSING_SCORE_CAP;
  scoreAbove80RequiresFilesystemProof: false;
  highScoreFloor: typeof HIGH_SCORE_FILESYSTEM_PROOF_FLOOR;
  inspected: boolean;
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
  "app",
  "src/app",
  "pages",
  "src/pages",
] as const;

const WORKSPACE_PACKAGE_PREFIX =
  /^(packages|apps|services|libs|modules|workspaces)\/[^/]+/i;

const ERROR_HANDLING_PATH =
  /(error[-_]?boundar|error[-_]?handler|exception[-_]?handler|(^|\/)global-error\.[cm]?[jt]sx?$|(^|\/)error\.[cm]?[jt]sx?$|(^|\/)errors?\.(ts|js|tsx|jsx|py|go)$|(^|\/)errors\/|middleware\/.*error|(^|\/)(onError|handleError|errorMiddleware|httpError|appError))/i;

const WEB_SHELL_PATH =
  /(^|\/)(next\.config\.[cm]?[jt]sx?$|vite\.config\.[cm]?[jt]sx?$|nuxt\.config\.[cm]?[jt]sx?$|remix\.config\.[cm]?[jt]sx?$|astro\.config\.[cm]?[jt]sx?$|svelte\.config\.[cm]?[jt]s$|angular\.json$|(src\/)?app\/(page|layout|global-error|template)\.[cm]?[jt]sx?$|(src\/)?pages\/(_app|_document|index)\.[cm]?[jt]sx?$|(src\/)?routes\/\+page\.[cm]?[jt]sx?$)/i;

const WEB_ENTRY_PATH = /(^|\/)(src\/)?(main|App)\.[cm]?[jt]sx$/i;
const WEB_INDEX_HTML = /(^|\/)index\.html$/i;

const TYPE_CONFIG_PATH =
  /(^|\/)(tsconfig.*\.json$|jsconfig\.json$|pyrightconfig\.json$|mypy\.ini$|\.mypy\.ini$|go\.mod$|Cargo\.toml$)/i;
const TYPED_SOURCE_PATH = /\.(tsx?|mts|cts)$/i;
const DECLARATION_PATH = /(^|\/)types\/|\.d\.ts$/i;
const STRUCTURE_DIR =
  /(^|\/)(src|lib|libs|packages|apps|services|modules|workspaces|internal|pkg|cmd)(\/|$)/i;
const PACKAGE_MANIFEST =
  /(^|\/)(package\.json$|go\.mod$|Cargo\.toml$|pyproject\.toml$|setup\.py$|composer\.json$|Gemfile$)/i;
const FRAMEWORK_CONFIG =
  /(^|\/)(next\.config\.|vite\.config\.|nuxt\.config\.|remix\.config\.|astro\.config\.|svelte\.config\.|angular\.json$|webpack\.config\.|turbo\.json$|nx\.json$|pnpm-workspace\.ya?ml$)/i;
const LINT_CONFIG =
  /(^|\/)(\.eslintrc|eslint\.config\.|biome\.json|\.prettierrc|prettier\.config\.)/i;

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

export function emptyArchitectureSignals(): ArchitectureSignals {
  return {
    has_type_config: false,
    has_typed_source: false,
    has_declaration: false,
    has_structure: false,
    has_workspace: false,
    has_manifest: false,
    has_framework_config: false,
    has_lint: false,
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
    architecture_paths: [],
    architecture_signals: emptyArchitectureSignals(),
    repo_kind: "library",
    source_file_count: 0,
    unit_test_file_count: 0,
    has_e2e_tools: false,
    executable_source_count: 0,
    ci_depth: "none",
    unhandled_async_count: 0,
    resilience_sampled: false,
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

const SOURCE_FILE_EXT =
  /\.(tsx?|jsx?|mts|cts|mjs|cjs|py|go|rs|java|kt|rb|php|cs|swift|dart)$/i;
const UNIT_TEST_FILE =
  /\.(tests?|spec)\.[cm]?[jt]sx?$/i;

const EXECUTABLE_CODE_FILE = /\.(tsx|ts|jsx|js|mts|cts|mjs|cjs)$/i;

/** App/library source that can be executed. Excludes declarations, docs, and assets. */
export function isExecutableCodeFile(path: string): boolean {
  if (isNoisePath(path) || isTestPath(path) || isTestConfigPath(path)) {
    return false;
  }
  if (/\.d\.ts$/i.test(path)) {
    return false;
  }
  return EXECUTABLE_CODE_FILE.test(path);
}

export function isSourceFile(path: string): boolean {
  if (isNoisePath(path) || isTestPath(path) || isTestConfigPath(path)) {
    return false;
  }
  return SOURCE_FILE_EXT.test(path);
}

export function isUnitTestFile(path: string): boolean {
  if (isNoisePath(path) || isTestConfigPath(path)) {
    return false;
  }

  return (
    UNIT_TEST_FILE.test(path) ||
    TEST_GO.test(path) ||
    TEST_PY.test(path) ||
    TEST_RUBY.test(path) ||
    TEST_RUST.test(path) ||
    TEST_ELIXIR.test(path) ||
    TEST_JVM.test(path) ||
    TEST_SWIFT.test(path) ||
    TEST_DART.test(path) ||
    TEST_DOTNET.test(path)
  );
}

export function hasE2eTooling(paths: string[]): boolean {
  return paths.some(
    (path) =>
      isSmokeOrE2eTestPath(path) ||
      /(^|\/)(playwright\.config|cypress\.config)/i.test(path)
  );
}

export function inferCiDepthFromPaths(paths: string[]): CiPipelineDepth {
  const workflows = paths.filter(isCiWorkflowPath);
  if (workflows.length === 0) {
    return "none";
  }

  const joined = workflows.join(" ");
  if (
    /(deploy|preview|release|vercel|netlify|fly\.io|render|pages-deploy)/i.test(
      joined
    )
  ) {
    return "deploy";
  }
  if (/(test|e2e|playwright|cypress|vitest|jest|pytest)/i.test(joined)) {
    return "tests";
  }
  return "lint_build";
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

export function isWebShellPath(path: string): boolean {
  if (isNoisePath(path)) {
    return false;
  }
  return WEB_SHELL_PATH.test(path);
}

export function isArchitectureSignalPath(path: string): boolean {
  if (isNoisePath(path)) {
    return false;
  }

  return (
    TYPE_CONFIG_PATH.test(path) ||
    DECLARATION_PATH.test(path) ||
    PACKAGE_MANIFEST.test(path) ||
    FRAMEWORK_CONFIG.test(path) ||
    LINT_CONFIG.test(path) ||
    isWebShellPath(path)
  );
}

export function detectArchitectureSignals(paths: string[]): ArchitectureSignals {
  const clean = paths.filter((path) => path.trim() && !isNoisePath(path));

  return {
    has_type_config: clean.some((path) => TYPE_CONFIG_PATH.test(path)),
    has_typed_source: clean.some((path) => TYPED_SOURCE_PATH.test(path)),
    has_declaration: clean.some((path) => DECLARATION_PATH.test(path)),
    has_structure: clean.some((path) => STRUCTURE_DIR.test(path)),
    has_workspace:
      discoverWorkspacePackageDirs(clean, 2).length > 0 ||
      clean.some((path) => /(^|\/)(pnpm-workspace\.ya?ml$|turbo\.json$|nx\.json$)/i.test(path)),
    has_manifest: clean.some((path) => PACKAGE_MANIFEST.test(path)),
    has_framework_config: clean.some((path) => FRAMEWORK_CONFIG.test(path)),
    has_lint: clean.some((path) => LINT_CONFIG.test(path)),
  };
}

export function detectRepoKind(paths: string[]): RepoKind {
  const clean = paths.filter((path) => path.trim() && !isNoisePath(path));
  if (clean.some(isWebShellPath)) {
    return "web_app";
  }

  const hasHtml = clean.some((path) => WEB_INDEX_HTML.test(path));
  const hasReactEntry = clean.some((path) => WEB_ENTRY_PATH.test(path));
  if (hasHtml && hasReactEntry) {
    return "web_app";
  }

  return "library";
}

export function classifyRepoFilesystem(
  paths: string[],
  options?: { truncated?: boolean; inspected?: boolean }
): RepoFilesystemEvidence {
  const unique = Array.from(
    new Set(paths.map((path) => path.trim()).filter(Boolean))
  ).filter((path) => !isNoisePath(path));

  const ciWorkflowPaths = unique
    .filter(isCiWorkflowPath)
    .slice(0, MAX_PATHS_PER_BUCKET);

  return {
    inspected: options?.inspected ?? unique.length > 0,
    truncated: Boolean(options?.truncated),
    file_count: unique.length,
    sample_paths: unique.slice(0, MAX_SAMPLE_PATHS),
    test_paths: unique.filter(isTestPath).slice(0, MAX_PATHS_PER_BUCKET),
    ci_workflow_paths: ciWorkflowPaths,
    error_handling_paths: unique
      .filter(isErrorHandlingPath)
      .slice(0, MAX_PATHS_PER_BUCKET),
    architecture_paths: unique
      .filter(isArchitectureSignalPath)
      .slice(0, MAX_PATHS_PER_BUCKET),
    architecture_signals: detectArchitectureSignals(unique),
    repo_kind: detectRepoKind(unique),
    source_file_count: unique.filter(isSourceFile).length,
    unit_test_file_count: unique.filter(isUnitTestFile).length,
    has_e2e_tools: hasE2eTooling(unique),
    executable_source_count: unique.filter(isExecutableCodeFile).length,
    ci_depth: inferCiDepthFromPaths(ciWorkflowPaths),
    unhandled_async_count: 0,
    resilience_sampled: false,
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
  const architecturePaths = asStringPaths(record.architecture_paths);
  const allKnownPaths = [
    ...samplePaths,
    ...testPaths,
    ...ciPaths,
    ...errorPaths,
    ...architecturePaths,
  ];

  const storedSignals =
    record.architecture_signals &&
    typeof record.architecture_signals === "object" &&
    !Array.isArray(record.architecture_signals)
      ? (record.architecture_signals as Record<string, unknown>)
      : null;

  const architectureSignals = storedSignals
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
    : detectArchitectureSignals(allKnownPaths);

  const storedKind = record.repo_kind;
  const repoKind: RepoKind =
    storedKind === "web_app" || storedKind === "library"
      ? storedKind
      : detectRepoKind(allKnownPaths);

  const asCount = (input: unknown): number =>
    typeof input === "number" && Number.isFinite(input)
      ? Math.max(0, Math.round(input))
      : 0;

  const storedDepth = record.ci_depth;
  const ciDepth: CiPipelineDepth =
    storedDepth === "lint_build" ||
    storedDepth === "tests" ||
    storedDepth === "deploy" ||
    storedDepth === "none"
      ? storedDepth
      : inferCiDepthFromPaths(ciPaths);

  return {
    inspected,
    truncated: record.truncated === true,
    file_count: fileCount,
    sample_paths: samplePaths,
    test_paths: testPaths,
    ci_workflow_paths: ciPaths,
    error_handling_paths: errorPaths,
    architecture_paths: architecturePaths,
    architecture_signals: architectureSignals,
    repo_kind: repoKind,
    source_file_count:
      asCount(record.source_file_count) ||
      allKnownPaths.filter(isSourceFile).length,
    unit_test_file_count:
      asCount(record.unit_test_file_count) ||
      allKnownPaths.filter(isUnitTestFile).length,
    has_e2e_tools:
      record.has_e2e_tools === true || hasE2eTooling(allKnownPaths),
    executable_source_count:
      asCount(record.executable_source_count) ||
      allKnownPaths.filter(isExecutableCodeFile).length,
    ci_depth: ciDepth,
    unhandled_async_count: asCount(record.unhandled_async_count),
    resilience_sampled: record.resilience_sampled === true,
    ci_has_lint: record.ci_has_lint === true ? true : record.ci_has_lint === false ? false : undefined,
    ci_has_tests: record.ci_has_tests === true ? true : record.ci_has_tests === false ? false : undefined,
    ci_has_build: record.ci_has_build === true ? true : record.ci_has_build === false ? false : undefined,
    ci_has_deploy: record.ci_has_deploy === true ? true : record.ci_has_deploy === false ? false : undefined,
    ci_has_monorepo_pipeline:
      record.ci_has_monorepo_pipeline === true
        ? true
        : record.ci_has_monorepo_pipeline === false
          ? false
          : undefined,
    route_contracts_sampled: record.route_contracts_sampled === true,
    route_schema_validation:
      record.route_schema_validation === true
        ? true
        : record.route_schema_validation === false
          ? false
          : undefined,
    unvalidated_type_assertions: asCount(record.unvalidated_type_assertions),
    has_contract_boundaries: record.has_contract_boundaries === true,
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

export function filesystemScoreCeiling(
  _evidence: RepoFilesystemEvidence | null | undefined
): number {
  // Four-pillar model: missing artifacts lower their pillar only. Never cap the total.
  return 100;
}

export function capScoreForFilesystemEvidence(
  score: unknown,
  _evidence: RepoFilesystemEvidence | null | undefined
): number {
  return clampScore0to100(score);
}

export function hasFilesystemProofForHighScore(
  evidence: RepoFilesystemEvidence | null | undefined
): boolean {
  return Boolean(evidence?.inspected) && missingCoreArtifacts(evidence).length === 0;
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

  return {
    proseNeverOverridesMissingFiles: true,
    scoringModel: "four_pillar",
    repoKind: evidence?.repo_kind ?? "library",
    weights: {
      architecture: 0.35,
      testing: 0.25,
      devops: 0.2,
      resilience: 0.2,
    },
    missingCoreArtifactMaxScore: MISSING_CORE_ARTIFACT_SCORE_CAP,
    multipleMissingOrUninspectedMaxScore: UNINSPECTED_OR_MULTIPLE_MISSING_SCORE_CAP,
    scoreAbove80RequiresFilesystemProof: false,
    highScoreFloor: HIGH_SCORE_FILESYSTEM_PROOF_FLOOR,
    inspected: Boolean(evidence?.inspected),
    coreArtifacts,
    missingCoreArtifacts: missingCoreArtifacts(evidence),
    appliedMaxScore: 100,
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
  missing_tests: {
    artifact: "tests",
    label: "Missing test suite",
    detail:
      "No test files, nested package test dirs, or test-runner config were found in the inspected file tree (Jest, Vitest, Ava, Mocha, Pytest, Go test, Playwright, Cypress, and similar all count). README claims of tests do not count.",
  },
  missing_ci: {
    artifact: "ci",
    label: "Missing CI/CD workflows",
    detail:
      "No CI/CD workflow files were found (.github/workflows, GitLab CI, Jenkins, CircleCI, Azure Pipelines, Travis, Buildkite, Drone, or Cloud Build). README claims of CI do not count.",
  },
  missing_error_handling: {
    artifact: "error_handling",
    label: "Missing error-handling files",
    detail:
      "No explicit error-handling files were found (error boundaries, error/exception handlers, or errors modules). Prose descriptions of error handling do not count.",
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
  return {
    ...result,
    score: clampScore0to100(result.score),
    scoreCap,
    redFlags: result.redFlags
      .filter((item) => !isFilesystemCapRedFlag(item))
      .slice(0, maxFlags),
  };
}
