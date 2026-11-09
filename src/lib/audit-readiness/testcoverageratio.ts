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

export function testCoverageRatio(
  filesystem?: RepoFilesystemEvidence | null
): number | null {
  if (!filesystem?.inspected) {
    return null;
  }

  const testFiles = resolveUnitTestFileCount(filesystem);
  if (testFiles === 0) {
    return 0;
  }

  const sourceFiles = Math.max(
    filesystem.executable_source_count > 0
      ? filesystem.executable_source_count
      : filesystem.source_file_count,
    filesystem.file_count - testFiles,
    testFiles
  );
  return testFiles / sourceFiles;
}
