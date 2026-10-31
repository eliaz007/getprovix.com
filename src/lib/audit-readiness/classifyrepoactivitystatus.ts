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
import type { RepoActivityStatus } from "./repoactivitystatus";
import { parseCommitTimestamps } from "./parsecommittimestamps";
import { isStaleCommitHistory } from "./isstalecommithistory";

export function classifyRepoActivityStatus(
  commitDates: string[] | null | undefined,
  now = Date.now()
): RepoActivityStatus {
  return isStaleCommitHistory(parseCommitTimestamps(commitDates), now)
    ? "stable"
    : "active";
}
