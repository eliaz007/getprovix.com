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
import type { ExecutiveChecklistItem } from "./executivechecklistitem";
import { coreArtifactFlags } from "./coreartifactflags";
import { classifyTestSuites } from "./classifytestsuites";
import { classifyHistoryChecklist } from "./classifyhistorychecklist";

export function buildExecutiveChecklist(input: {
  scoreCap?: ScoreCapAudit | null;
  filesystem?: RepoFilesystemEvidence | null;
  commitDates?: string[] | null;
  commitStats?: CommitHistoryStat[] | null;
  commitHistoryPenalty?: number | null;
  deliveryHygieneScore?: number | null;
  historyAvailable?: boolean | null;
  testingScore?: number | null;
}): ExecutiveChecklistItem[] {
  const artifacts = coreArtifactFlags(input.scoreCap, input.filesystem);
  const tests = classifyTestSuites(
    artifacts.tests,
    input.filesystem,
    input.testingScore
  );
  const hygiene =
    typeof input.deliveryHygieneScore === "number" &&
    Number.isFinite(input.deliveryHygieneScore)
      ? input.deliveryHygieneScore
      : typeof input.commitHistoryPenalty === "number" &&
          Number.isFinite(input.commitHistoryPenalty)
        ? Math.max(0, 100 - Math.max(0, input.commitHistoryPenalty))
        : 100;
  const history = classifyHistoryChecklist(
    hygiene,
    input.commitDates,
    input.commitStats,
    input.historyAvailable
  );

  return [
    {
      id: "ci",
      label: "CI/CD Pipelines",
      status: artifacts.ci ? "Configured" : "None detected",
      tone: artifacts.ci ? "pass" : "fail",
    },
    {
      id: "error_handling",
      label: "Error Handling",
      status: artifacts.error_handling ? "Standardized" : "Missing boundaries",
      tone: artifacts.error_handling ? "pass" : "fail",
    },
    {
      id: "tests",
      label: "Test Suites",
      status: tests.status,
      tone: tests.tone,
    },
    {
      id: "history",
      label: "History",
      status: history.status,
      tone: history.tone,
    },
  ];
}
