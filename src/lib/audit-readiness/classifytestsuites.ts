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
import { testCoverageRatio } from "./testcoverageratio";

export function classifyTestSuites(
  testsPresent: boolean,
  filesystem?: RepoFilesystemEvidence | null,
  testingScore?: number | null
): { status: string; tone: ChecklistTone } {
  const paths = filesystem?.test_paths ?? [];
  if (!testsPresent && paths.length === 0) {
    return { status: "No tests", tone: "fail" };
  }

  const ratio = testCoverageRatio(filesystem);
  const score =
    typeof testingScore === "number" && Number.isFinite(testingScore)
      ? clampScore0to100(testingScore)
      : filesystem?.inspected
        ? scoreTesting(filesystem)
        : testsPresent
          ? 50
          : 0;

  if (score < 30 || (ratio != null && ratio < 0.15)) {
    return { status: "Coverage Gaps", tone: "warn" };
  }

  if (score < 75 && !(ratio != null && ratio >= 0.35)) {
    return { status: "Partial Suite", tone: "warn" };
  }

  if (score >= 75 || (ratio != null && ratio >= 0.35)) {
    return { status: "Full coverage", tone: "pass" };
  }

  return { status: "Partial Suite", tone: "warn" };
}
