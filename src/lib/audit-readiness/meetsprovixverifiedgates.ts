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
import { CODE_HEALTH_VERIFIED_THRESHOLD } from "./code-health-verified-threshold";
import type { ProvixVerifiedGateInput } from "./provixverifiedgateinput";
import { isHistoryGateMet } from "./ishistorygatemet";

/**
 * Single source of truth for Provix Verified, onboarding track qualification,
 * and production-score publishing: Code Health ≥ 75 and History ≥ 80 with
 * fetched commit history.
 */
export function meetsProvixVerifiedGates(
  input: ProvixVerifiedGateInput
): boolean {
  return (
    clampScore0to100(input.codeHealthScore) >= CODE_HEALTH_VERIFIED_THRESHOLD &&
    isHistoryGateMet(input)
  );
}
