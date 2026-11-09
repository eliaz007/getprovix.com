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
 * Shared Verified / publish / onboarding-track gate input.
 * `historyAvailable: false` means the commit list fetch failed — History
 * cannot pass even if a numeric hygiene placeholder is 100.
 */
export type ProvixVerifiedGateInput = {
  codeHealthScore: number;
  deliveryHygieneScore?: number | null;
  historyAvailable?: boolean | null;
};
