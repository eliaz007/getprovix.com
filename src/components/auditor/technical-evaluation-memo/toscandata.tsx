import type { AuditCheck } from "@/lib/audit-checks";
import { selectPrimaryCiWorkflowPath } from "@/lib/audit-content-signals";
import {
  formatCodebaseBenchmark,
  type CodebaseBenchmark,
} from "@/lib/codebase-benchmark";
import type { ProductionAuditMetrics } from "@/lib/production-audit-metrics";
import {
  resolveUnitTestFileCount,
  type RepoFilesystemEvidence,
} from "@/lib/repo-filesystem";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  buildGitProvenance,
  buildHiringBattlePlanProbes,
  buildPillarSubLogs,
  buildSubsystemBlastRadius,
  type BlastRadiusRow,
  type GitProvenance,
  type PillarSubLog,
} from "@/lib/forensic-dossier";
import {
  synthesizeAuditInsights,
  type AuditScanData,
} from "@/lib/synthesize-audit-insights";
import type { MemoInput } from "./memoinput";
import { shortPath } from "./shortpath";

export function toScanData(input: MemoInput): AuditScanData {
  const filesystem = input.filesystem;
  const inspected = filesystem?.inspected === true;
  const hasCi = (filesystem?.ci_workflow_paths.length ?? 0) > 0;
  const boundary = filesystem?.error_handling_paths[0] ?? null;
  const ciPath = selectPrimaryCiWorkflowPath(filesystem?.ci_workflow_paths);
  const testing = clampScore0to100(input.metrics.testing);
  const paths = [
    ...(filesystem?.sample_paths ?? []),
    ...(filesystem?.architecture_paths ?? []),
  ];
  const hasAppRouter = paths.some((path: (typeof paths)[number]) =>
    /(^|\/)(src\/)?app\//i.test(path)
  );

  return {
    architecture: clampScore0to100(input.metrics.architecture),
    devops: clampScore0to100(input.metrics.devops),
    resilience: clampScore0to100(input.metrics.resilience),
    testing,
    testingScore: testing,
    boundaryFile: boundary ? shortPath(boundary) : null,
    ciPath: ciPath ? shortPath(ciPath) : null,
    testPathsCount: filesystem ? resolveUnitTestFileCount(filesystem) : 0,
    unhandledAsyncCount: filesystem?.resilience_sampled
      ? filesystem.unhandled_async_count
      : null,
    totalFiles: filesystem?.file_count ?? 0,
    tsStrict: false,
    ciStatus: !inspected ? "" : hasCi ? "Active" : "Inactive",
    repoKind: filesystem?.repo_kind ?? null,
    hasAppRouter,
    hasBoundary: Boolean(boundary),
    hasCi,
  };
}
