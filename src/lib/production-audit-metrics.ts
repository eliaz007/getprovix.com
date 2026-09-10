import { clampScore0to100 } from "@/lib/score-scale";
import {
  emptyRepoFilesystemEvidence,
  isCiWorkflowPath,
  isErrorHandlingPath,
  isNoisePath,
  isTestPath,
  type RepoFilesystemEvidence,
} from "@/lib/repo-filesystem";

/** Weights for the production audit scorecard (must sum to 1). */
export const PRODUCTION_METRIC_WEIGHTS = {
  ciCdHealth: 0.3,
  testAssertionDensity: 0.4,
  errorBoundaries: 0.3,
} as const;

export type ProductionAuditMetrics = {
  ciCdHealth: number;
  testAssertionDensity: number;
  errorBoundaries: number;
  productionScore: number;
  weights: {
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
    ciWorkflowPaths: string[];
    testPaths: string[];
    errorBoundaryPaths: string[];
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

export function emptyProductionAuditMetrics(): ProductionAuditMetrics {
  return {
    ciCdHealth: 0,
    testAssertionDensity: 0,
    errorBoundaries: 0,
    productionScore: 0,
    weights: { ...PRODUCTION_METRIC_WEIGHTS },
    evidence: {
      inspected: false,
      truncated: false,
      fileCount: 0,
      ciWorkflowCount: 0,
      githubWorkflowCount: 0,
      testFileCount: 0,
      errorBoundaryCount: 0,
      ciWorkflowPaths: [],
      testPaths: [],
      errorBoundaryPaths: [],
    },
  };
}

/**
 * CI/CD Health (0–100): prefers `.github/workflows/*.yml`, with partial
 * credit for other recognized CI config files.
 */
export function scoreCiCdHealth(evidence: RepoFilesystemEvidence): number {
  if (!evidence.inspected) {
    return 0;
  }

  const workflows = evidence.ci_workflow_paths.filter(isCiWorkflowPath);
  if (workflows.length === 0) {
    return 0;
  }

  const githubWorkflows = workflows.filter(isGithubWorkflowPath);
  const otherCi = workflows.length - githubWorkflows.length;

  if (githubWorkflows.length === 0) {
    return clampScore0to100(Math.min(70, 35 + otherCi * 15));
  }

  let score = 55;
  if (githubWorkflows.length >= 2) {
    score += 25;
  }
  if (githubWorkflows.length >= 3) {
    score += 20;
  } else if (otherCi > 0) {
    score += Math.min(15, otherCi * 8);
  }

  return clampScore0to100(score);
}

/**
 * Test Assertion Density (0–100): approximates assertion coverage from
 * test file / directory presence relative to the inspected tree size.
 * (File-tree audits cannot count `expect()` calls without blob contents.)
 */
export function scoreTestAssertionDensity(
  evidence: RepoFilesystemEvidence
): number {
  if (!evidence.inspected) {
    return 0;
  }

  const testFiles = evidence.test_paths.filter(isTestPath);
  if (testFiles.length === 0) {
    return 0;
  }

  const fileCount = Math.max(evidence.file_count, 1);
  const density = testFiles.length / fileCount;

  // Presence baseline, volume bonus, and density bonus.
  const presence = 40;
  const volume = Math.min(35, testFiles.length * 7);
  const densityBonus = Math.min(25, Math.round(density * 250));

  return clampScore0to100(presence + volume + densityBonus);
}

/**
 * Error Boundaries (0–100): rewards React `error.tsx` / `ErrorBoundary`
 * files, with limited credit for other explicit error-handling modules.
 */
export function scoreErrorBoundaries(evidence: RepoFilesystemEvidence): number {
  if (!evidence.inspected) {
    return 0;
  }

  const handlers = evidence.error_handling_paths.filter(isErrorHandlingPath);
  if (handlers.length === 0) {
    return 0;
  }

  const reactBoundaries = handlers.filter(isReactErrorBoundaryPath);
  const otherHandlers = handlers.length - reactBoundaries.length;

  if (reactBoundaries.length === 0) {
    return clampScore0to100(Math.min(55, 25 + otherHandlers * 15));
  }

  if (reactBoundaries.length >= 2) {
    return clampScore0to100(100);
  }

  return clampScore0to100(otherHandlers > 0 ? 90 : 75);
}

export function weightedProductionScore(parts: {
  ciCdHealth: number;
  testAssertionDensity: number;
  errorBoundaries: number;
}): number {
  const total =
    parts.ciCdHealth * PRODUCTION_METRIC_WEIGHTS.ciCdHealth +
    parts.testAssertionDensity * PRODUCTION_METRIC_WEIGHTS.testAssertionDensity +
    parts.errorBoundaries * PRODUCTION_METRIC_WEIGHTS.errorBoundaries;

  return clampScore0to100(total);
}

export function computeProductionAuditMetrics(
  evidence: RepoFilesystemEvidence | null | undefined
): ProductionAuditMetrics {
  const normalized = evidence ?? emptyRepoFilesystemEvidence();

  if (!normalized.inspected) {
    return emptyProductionAuditMetrics();
  }

  const ciWorkflowPaths = normalized.ci_workflow_paths.filter(isCiWorkflowPath);
  const testPaths = normalized.test_paths.filter(isTestPath);
  const errorBoundaryPaths = normalized.error_handling_paths.filter(
    (path) => isReactErrorBoundaryPath(path) || isErrorHandlingPath(path)
  );

  const ciCdHealth = scoreCiCdHealth(normalized);
  const testAssertionDensity = scoreTestAssertionDensity(normalized);
  const errorBoundaries = scoreErrorBoundaries(normalized);
  const productionScore = weightedProductionScore({
    ciCdHealth,
    testAssertionDensity,
    errorBoundaries,
  });

  return {
    ciCdHealth,
    testAssertionDensity,
    errorBoundaries,
    productionScore,
    weights: { ...PRODUCTION_METRIC_WEIGHTS },
    evidence: {
      inspected: true,
      truncated: Boolean(normalized.truncated),
      fileCount: normalized.file_count,
      ciWorkflowCount: ciWorkflowPaths.length,
      githubWorkflowCount: ciWorkflowPaths.filter(isGithubWorkflowPath).length,
      testFileCount: testPaths.length,
      errorBoundaryCount: errorBoundaryPaths.filter(isReactErrorBoundaryPath)
        .length,
      ciWorkflowPaths: ciWorkflowPaths.slice(0, 8),
      testPaths: testPaths.slice(0, 8),
      errorBoundaryPaths: errorBoundaryPaths.slice(0, 8),
    },
  };
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

  return {
    ciCdHealth: clampScore0to100(record.ciCdHealth),
    testAssertionDensity: clampScore0to100(record.testAssertionDensity),
    errorBoundaries: clampScore0to100(record.errorBoundaries),
    productionScore: clampScore0to100(record.productionScore),
    weights: { ...PRODUCTION_METRIC_WEIGHTS },
    evidence: {
      inspected: evidenceRecord?.inspected === true,
      truncated: evidenceRecord?.truncated === true,
      fileCount: asCount(evidenceRecord?.fileCount),
      ciWorkflowCount: asCount(evidenceRecord?.ciWorkflowCount),
      githubWorkflowCount: asCount(evidenceRecord?.githubWorkflowCount),
      testFileCount: asCount(evidenceRecord?.testFileCount),
      errorBoundaryCount: asCount(evidenceRecord?.errorBoundaryCount),
      ciWorkflowPaths: asPaths(evidenceRecord?.ciWorkflowPaths),
      testPaths: asPaths(evidenceRecord?.testPaths),
      errorBoundaryPaths: asPaths(evidenceRecord?.errorBoundaryPaths),
    },
  };
}
