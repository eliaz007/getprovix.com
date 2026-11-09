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
import type { ReadinessBadge } from "./readinessbadge";
import { getVerificationTierBadge } from "./getverificationtierbadge";

/**
 * Readiness / verification badge using the shared Provix Verified gates.
 */
export function getReadinessBadge(
  score: number,
  deliveryHygieneScore?: number | null,
  historyAvailable?: boolean | null
): ReadinessBadge {
  return getVerificationTierBadge(
    score,
    deliveryHygieneScore,
    historyAvailable
  );
}
