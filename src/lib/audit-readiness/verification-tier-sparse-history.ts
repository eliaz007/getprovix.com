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

/** @deprecated Third tier removed; kept for older string compares. */
export const VERIFICATION_TIER_SPARSE_HISTORY =
  "Code Verified · Sparse History" as const;
