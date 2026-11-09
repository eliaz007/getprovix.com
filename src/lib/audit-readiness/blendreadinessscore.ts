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
import { READINESS_QUALITATIVE_WEIGHT } from "./readiness-qualitative-weight";
import { READINESS_PRODUCTION_WEIGHT } from "./readiness-production-weight";
import { applyCommitHistoryScoreFloor } from "./applycommithistoryscorefloor";

/**
 * Blend qualitative LLM score with the file-tree production scorecard.
 * Commit age is informational only and is not subtracted here.
 */
export function blendReadinessScore(input: {
  qualitativeScore: number;
  productionScore: number;
  /** @deprecated History floor no longer depends on core artifacts. */
  coreArtifactsPresent?: boolean;
  commitDates?: string[] | null;
  now?: number;
}): number {
  const production = clampScore0to100(input.productionScore);
  const qualitativeAdjusted = applyCommitHistoryScoreFloor(
    input.qualitativeScore,
    production,
    input.commitDates,
    input.now
  );

  return clampScore0to100(
    Math.round(
      qualitativeAdjusted * READINESS_QUALITATIVE_WEIGHT +
        production * READINESS_PRODUCTION_WEIGHT
    )
  );
}
