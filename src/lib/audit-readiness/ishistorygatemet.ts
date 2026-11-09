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
import { DELIVERY_HYGIENE_VERIFIED_THRESHOLD } from "./delivery-hygiene-verified-threshold";
import type { ProvixVerifiedGateInput } from "./provixverifiedgateinput";

/** History ≥ 80 and a successful commit fetch. */
export function isHistoryGateMet(
  input: Pick<
    ProvixVerifiedGateInput,
    "deliveryHygieneScore" | "historyAvailable"
  >
): boolean {
  if (input.historyAvailable === false) {
    return false;
  }
  if (
    typeof input.deliveryHygieneScore !== "number" ||
    !Number.isFinite(input.deliveryHygieneScore)
  ) {
    return false;
  }
  return (
    clampScore0to100(input.deliveryHygieneScore) >=
    DELIVERY_HYGIENE_VERIFIED_THRESHOLD
  );
}
