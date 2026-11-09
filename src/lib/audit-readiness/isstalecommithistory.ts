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
import { STALE_AFTER_MS } from "./stale-after-ms";

export function isStaleCommitHistory(
  parsed: number[],
  now = Date.now()
): boolean {
  if (parsed.length === 0) {
    return true;
  }

  return now - parsed[parsed.length - 1] >= STALE_AFTER_MS;
}
