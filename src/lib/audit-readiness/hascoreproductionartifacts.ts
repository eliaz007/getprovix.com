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
import { coreArtifactFlags } from "./coreartifactflags";

export function hasCoreProductionArtifacts(
  scoreCap?: ScoreCapAudit | null,
  filesystem?: RepoFilesystemEvidence | null
): boolean {
  const flags = coreArtifactFlags(scoreCap, filesystem);
  return flags.tests && flags.ci && flags.error_handling;
}
