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
