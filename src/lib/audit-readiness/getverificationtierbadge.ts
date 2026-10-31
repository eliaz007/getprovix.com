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
import type { ReadinessBadge } from "./readinessbadge";
import { VERIFICATION_TIER_PROVIX } from "./verification-tier-provix";
import { assignVerificationTier } from "./assignverificationtier";

export function getVerificationTierBadge(
  codeHealthScore: number,
  deliveryHygieneScore?: number | null,
  historyAvailable?: boolean | null
): ReadinessBadge {
  const tier = assignVerificationTier(
    codeHealthScore,
    deliveryHygieneScore,
    historyAvailable
  );

  if (tier === VERIFICATION_TIER_PROVIX) {
    return {
      label: tier,
      className: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
      meterClassName: "text-emerald-400",
    };
  }

  return {
    label: tier,
    className: "text-rose-300 bg-rose-500/10 border-rose-500/30",
    meterClassName: "text-rose-400",
  };
}
