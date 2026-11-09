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
import { meetsProvixVerifiedGates } from "./meetsprovixverifiedgates";

/** Full-Time / Contract track qualification (same floors as Verified). */
export function qualifiesHiringTrack(
  trackScore: number,
  deliveryHygieneScore?: number | null,
  historyAvailable?: boolean | null
): boolean {
  return meetsProvixVerifiedGates({
    codeHealthScore: trackScore,
    deliveryHygieneScore,
    historyAvailable,
  });
}
