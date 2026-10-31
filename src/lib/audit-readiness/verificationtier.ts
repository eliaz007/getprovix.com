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
 * Verification labels for contract / full-time audits.
 * No third "Sparse History" tier — fail closed to Needs Refinement.
 */
export type VerificationTier = "Provix Verified" | "Needs Refinement";
