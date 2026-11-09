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
import { isHistoryGateMet } from "./ishistorygatemet";

/** Executive Checklist History row from Delivery Hygiene + commit signals. */
export function classifyHistoryChecklist(
  deliveryHygieneScore: number,
  commitDates?: string[] | null,
  commitStats?: CommitHistoryStat[] | null,
  historyAvailable: boolean | null = true
): { status: string; tone: ChecklistTone } {
  if (historyAvailable === false) {
    return { status: "History unavailable", tone: "fail" };
  }
  const hygiene = clampScore0to100(deliveryHygieneScore);
  const status = formatCommitHistoryReason(commitDates, commitStats);
  // Verified History floor is 80 — do not treat 60 as a pass band.
  if (isHistoryGateMet({ deliveryHygieneScore: hygiene, historyAvailable })) {
    return { status, tone: "pass" };
  }
  if (hygiene > 0) {
    return { status, tone: "warn" };
  }
  return { status, tone: "fail" };
}
