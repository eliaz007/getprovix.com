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
