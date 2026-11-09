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
import type { VerificationTier } from "./verificationtier";
import { VERIFICATION_TIER_PROVIX } from "./verification-tier-provix";
import { VERIFICATION_TIER_NEEDS_REFINEMENT } from "./verification-tier-needs-refinement";
import { meetsProvixVerifiedGates } from "./meetsprovixverifiedgates";

/**
 * Dual-threshold verification (contract + full-time share these floors):
 * - Provix Verified: codeHealth >= 75 AND history gate met
 * - Needs Refinement: otherwise (no Sparse History tier)
 */
export function assignVerificationTier(
  codeHealthScore: number,
  deliveryHygieneScore?: number | null,
  historyAvailable?: boolean | null
): VerificationTier {
  return meetsProvixVerifiedGates({
    codeHealthScore,
    deliveryHygieneScore,
    historyAvailable,
  })
    ? VERIFICATION_TIER_PROVIX
    : VERIFICATION_TIER_NEEDS_REFINEMENT;
}
