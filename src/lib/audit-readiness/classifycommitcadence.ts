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
import type { ChecklistTone } from "./checklisttone";
import type { RepoActivityStatus } from "./repoactivitystatus";
import { classifyRepoActivityStatus } from "./classifyrepoactivitystatus";

/**
 * Informational repo activity from sampled commit dates only.
 * Kept for callers; Executive Checklist uses History instead.
 */
export function classifyCommitCadence(
  commitDates: string[] | null | undefined,
  now = Date.now(),
  _commitStats?: CommitHistoryStat[] | null
): {
  status: string;
  tone: ChecklistTone;
  /** Always 0 — activity is informational. */
  penalty: number;
  /** Always 0 — kept for callers that still read the field. */
  commitHistoryPenalty: number;
  activity: RepoActivityStatus;
} {
  const activity = classifyRepoActivityStatus(commitDates, now);
  return {
    status: activity,
    activity,
    tone: activity === "active" ? "pass" : "warn",
    penalty: 0,
    commitHistoryPenalty: 0,
  };
}
