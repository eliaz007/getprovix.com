import { clampScore0to100 } from "@/lib/score-scale";

export const MISSING_CORE_ARTIFACT_SCORE_CAP = 60;
export const UNINSPECTED_OR_MULTIPLE_MISSING_SCORE_CAP = 50;
export const HIGH_SCORE_FILESYSTEM_PROOF_FLOOR = 81;

export type CoreArtifactKind = "tests" | "ci" | "error_handling";

export type RepoFilesystemEvidence = {
  inspected: boolean;
  truncated: boolean;
  file_count: number;
  sample_paths: string[];
  test_paths: string[];
  ci_workflow_paths: string[];
  error_handling_paths: string[];
};

export type FilesystemScorePolicy = {
  proseNeverOverridesMissingFiles: true;
  missingCoreArtifactMaxScore: typeof MISSING_CORE_ARTIFACT_SCORE_CAP;
  multipleMissingOrUninspectedMaxScore: typeof UNINSPECTED_OR_MULTIPLE_MISSING_SCORE_CAP;
  scoreAbove80RequiresFilesystemProof: true;
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

const MAX_PATHS_PER_BUCKET = 16;
const MAX_SAMPLE_PATHS = 20;

const NOISE_PATH =
  /(^|\/)(node_modules|dist|build|out|\.next|coverage|vendor|\.git|__pycache__|\.venv|venv)(\/|$)/i;

const TEST_DIR = /(^|\/)(__tests__|tests?|spec|e2e)(\/|$)/i;
const TEST_FILE =
  /\.(tests?|spec)\.[cm]?[jt]sx?$/i;
const TEST_GO = /_test\.go$/i;
const TEST_PY = /(^|\/)test_[^/]+\.py$|_test\.py$/i;
const TEST_CONFIG =
  /(^|\/)(jest\.config|vitest\.config|karma\.conf|pytest\.ini|phpunit\.xml|cypress\.config|playwright\.config)/i;

const CI_PATH =
  /(^|\/)(\.github\/workflows\/[^/]+\.ya?ml$|\.gitlab-ci\.ya?ml$|Jenkinsfile$|\.circleci\/|azure-pipelines\.ya?ml$|\.travis\.ya?ml$|bitbucket-pipelines\.ya?ml$|\.buildkite\/)/i;

const ERROR_HANDLING_PATH =
  /(error[-_]?boundar|error[-_]?handler|exception[-_]?handler|(^|\/)global-error\.[cm]?[jt]sx?$|(^|\/)error\.[cm]?[jt]sx?$|(^|\/)errors?\.(ts|js|tsx|jsx|py|go)$|(^|\/)errors\/|middleware\/.*error)/i;

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

export function emptyRepoFilesystemEvidence(): RepoFilesystemEvidence {
  return {
    inspected: false,
    truncated: false,
    file_count: 0,
    sample_paths: [],
    test_paths: [],
    ci_workflow_paths: [],
    error_handling_paths: [],
  };
}

export function isNoisePath(path: string): boolean {
  return NOISE_PATH.test(path);
}

export function isTestPath(path: string): boolean {
  if (isNoisePath(path)) {
    return false;
  }

  return (
    TEST_DIR.test(path) ||
    TEST_FILE.test(path) ||
    TEST_GO.test(path) ||
    TEST_PY.test(path) ||
    TEST_CONFIG.test(path)
  );
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

  return {
    inspected,
    truncated: record.truncated === true,
    file_count: fileCount,
    sample_paths: asStringPaths(record.sample_paths, MAX_SAMPLE_PATHS),
    test_paths: asStringPaths(record.test_paths),
    ci_workflow_paths: asStringPaths(record.ci_workflow_paths),
    error_handling_paths: asStringPaths(record.error_handling_paths),
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
  evidence: RepoFilesystemEvidence | null | undefined
): number {
  const missing = missingCoreArtifacts(evidence);
  if (!evidence?.inspected || missing.length >= 2) {
    return UNINSPECTED_OR_MULTIPLE_MISSING_SCORE_CAP;
  }
  if (missing.length === 1) {
    return MISSING_CORE_ARTIFACT_SCORE_CAP;
  }
  return 100;
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

  return {
    proseNeverOverridesMissingFiles: true,
    missingCoreArtifactMaxScore: MISSING_CORE_ARTIFACT_SCORE_CAP,
    multipleMissingOrUninspectedMaxScore: UNINSPECTED_OR_MULTIPLE_MISSING_SCORE_CAP,
    scoreAbove80RequiresFilesystemProof: true,
    highScoreFloor: HIGH_SCORE_FILESYSTEM_PROOF_FLOOR,
    inspected: Boolean(evidence?.inspected),
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
): T {
  const ceiling = filesystemScoreCeiling(evidence);
  const capped = Math.min(result.score, ceiling);
  if (capped >= result.score) {
    return { ...result, score: capped };
  }

  const flag = filesystemCapRedFlag(ceiling, evidence);
  return {
    ...result,
    score: capped,
    redFlags: [flag, ...result.redFlags.filter((item) => item !== flag)].slice(
      0,
      maxFlags
    ),
  };
}
