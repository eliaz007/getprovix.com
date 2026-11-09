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
import { applyCommitHistoryScoreFloor } from "./applycommithistoryscorefloor";

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
