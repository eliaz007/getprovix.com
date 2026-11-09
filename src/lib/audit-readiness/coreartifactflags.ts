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

export function coreArtifactFlags(
  scoreCap?: ScoreCapAudit | null,
  filesystem?: RepoFilesystemEvidence | null
): { tests: boolean; ci: boolean; error_handling: boolean } {
  if (filesystem) {
    return {
      tests: filesystem.test_paths.length > 0,
      ci: filesystem.ci_workflow_paths.length > 0,
      error_handling: filesystem.error_handling_paths.length > 0,
    };
  }

  return {
    tests: Boolean(scoreCap?.coreArtifacts.tests),
    ci: Boolean(scoreCap?.coreArtifacts.ci),
    error_handling: Boolean(scoreCap?.coreArtifacts.error_handling),
  };
}
