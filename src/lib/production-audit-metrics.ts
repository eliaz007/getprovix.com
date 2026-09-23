import { clampScore0to100 } from "@/lib/score-scale";
import {
  emptyArchitectureSignals,
  emptyRepoFilesystemEvidence,
  isCiWorkflowPath,
  isErrorHandlingPath,
  isNoisePath,
  isTestPath,
  parseRepoFilesystemEvidence,
  type ArchitectureSignals,
  type RepoFilesystemEvidence,
  type RepoKind,
} from "@/lib/repo-filesystem";

/** Weights for the production audit scorecard (must sum to 1). */
export const PRODUCTION_METRIC_WEIGHTS = {
  architecture: 0.35,
  testing: 0.25,
  devops: 0.2,
  resilience: 0.2,
} as const;

export type ProductionAuditMetrics = {
  architecture: number;
  testing: number;
  devops: number;
  resilience: number;
  productionScore: number;
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

function withAliases(parts: {
  architecture: number;
  testing: number;
  devops: number;
  resilience: number;
  productionScore: number;
}): Pick<
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
      architecture: PRODUCTION_METRIC_WEIGHTS.architecture,
      testing: PRODUCTION_METRIC_WEIGHTS.testing,
      devops: PRODUCTION_METRIC_WEIGHTS.devops,
      resilience: PRODUCTION_METRIC_WEIGHTS.resilience,
      ciCdHealth: PRODUCTION_METRIC_WEIGHTS.devops,
      testAssertionDensity: PRODUCTION_METRIC_WEIGHTS.testing,
      errorBoundaries: PRODUCTION_METRIC_WEIGHTS.resilience,
    },
  };
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

/**
 * Architecture (0-100): structure, type safety, and modularity from the file tree.
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

  return clampScore0to100(score);
}

/**
 * DevOps / CI (0-100): prefers `.github/workflows/*.yml`, with partial
 * credit for other recognized CI config files.
 */
export function scoreDevops(evidence: RepoFilesystemEvidence): number {
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
    return clampScore0to100(35 + otherCi * 15);
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

/** @deprecated Use scoreDevops. */
export function scoreCiCdHealth(evidence: RepoFilesystemEvidence): number {
  return scoreDevops(evidence);
}

/**
 * Testing (0-100): presence and density of unit/integration test suites.
 */
export function scoreTesting(evidence: RepoFilesystemEvidence): number {
  if (!evidence.inspected) {
    return 0;
  }

  const testFiles = evidence.test_paths.filter(isTestPath);
  if (testFiles.length === 0) {
    return 0;
  }

  const fileCount = Math.max(evidence.file_count, 1);
  const density = testFiles.length / fileCount;

  const presence = 40;
  const volume = Math.min(35, testFiles.length * 7);
  const densityBonus = Math.min(25, Math.round(density * 250));

  return clampScore0to100(presence + volume + densityBonus);
}

/** @deprecated Use scoreTesting. */
export function scoreTestAssertionDensity(
  evidence: RepoFilesystemEvidence
): number {
  return scoreTesting(evidence);
}

/**
 * Resilience (0-100): structured error handling.
 * Web apps: missing React error boundaries deduct here only.
 * Libraries / backends: grade try/catch modules; do not penalize missing boundaries.
 */
export function scoreResilience(
  evidence: RepoFilesystemEvidence,
  repoKind: RepoKind = evidence.repo_kind ?? "library"
): number {
  if (!evidence.inspected) {
    return 0;
  }

  const handlers = evidence.error_handling_paths.filter(isErrorHandlingPath);
  const reactBoundaries = handlers.filter(isReactErrorBoundaryPath);
  const standardHandlers = handlers.filter(
    (path) => !isReactErrorBoundaryPath(path)
  );

  if (repoKind !== "web_app") {
    const count = handlers.length;
    if (count === 0) {
      return 0;
    }
    if (count >= 3) {
      return 100;
    }
    if (count === 2) {
      return 85;
    }
    return 70;
  }

  if (handlers.length === 0) {
    return 0;
  }

  if (reactBoundaries.length === 0) {
    return clampScore0to100(20 + standardHandlers.length * 15);
  }

  if (reactBoundaries.length >= 2) {
    return 100;
  }

  return standardHandlers.length > 0 ? 90 : 75;
}

/** @deprecated Use scoreResilience. */
export function scoreErrorBoundaries(evidence: RepoFilesystemEvidence): number {
  return scoreResilience(evidence, evidence.repo_kind ?? "library");
}

export function weightedProductionScore(parts: {
  architecture: number;
  testing: number;
  devops: number;
  resilience: number;
}): number {
  return clampScore0to100(
    Math.round(
      parts.architecture * PRODUCTION_METRIC_WEIGHTS.architecture +
        parts.testing * PRODUCTION_METRIC_WEIGHTS.testing +
        parts.devops * PRODUCTION_METRIC_WEIGHTS.devops +
        parts.resilience * PRODUCTION_METRIC_WEIGHTS.resilience
    )
  );
}

export function computeProductionAuditMetrics(
  evidence: RepoFilesystemEvidence | null | undefined
): ProductionAuditMetrics {
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
  const testing = scoreTesting(normalized);
  const devops = scoreDevops(normalized);
  const resilience = scoreResilience(normalized, repoKind);
  const productionScore = weightedProductionScore({
    architecture,
    testing,
    devops,
    resilience,
  });

  return {
    ...withAliases({
      architecture,
      testing,
      devops,
      resilience,
      productionScore,
    }),
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
}): ProductionAuditMetrics {
  if (input.filesystem?.inspected) {
    return computeProductionAuditMetrics(input.filesystem);
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
  const storedScore =
    typeof record.productionScore === "number" &&
    Number.isFinite(record.productionScore)
      ? clampScore0to100(record.productionScore)
      : weightedProductionScore({
          architecture,
          testing,
          devops,
          resilience,
        });

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
      productionScore: storedScore,
    }),
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
