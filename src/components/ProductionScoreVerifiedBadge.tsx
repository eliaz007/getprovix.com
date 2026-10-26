import { ShieldCheck } from "lucide-react";
import {
  PUBLIC_SCORECARD_THRESHOLD,
  getProductionScoreBadge,
} from "@/lib/production-audit";
import { cn } from "@/lib/cn";

type ProductionScoreVerifiedBadgeProps = {
  score: number | null | undefined;
  /** Delivery Hygiene / History. */
  deliveryHygieneScore?: number | null;
  /** False when commit history could not be fetched. */
  historyAvailable?: boolean | null;
  className?: string;
};

/**
 * Renders only when shared Provix Verified gates pass (Code Health ≥ 75,
 * History ≥ 80, commit history fetched).
 */
export default function ProductionScoreVerifiedBadge({
  score,
  deliveryHygieneScore,
  historyAvailable,
  className = "",
}: ProductionScoreVerifiedBadgeProps) {
  const badge =
    score == null
      ? null
      : getProductionScoreBadge(
          score,
          deliveryHygieneScore,
          historyAvailable
        );

  if (!badge) {
    return null;
  }

  return (
    <span
      title={`Code health ${PUBLIC_SCORECARD_THRESHOLD}+ and History 80+`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]",
        className
      )}
    >
      <ShieldCheck className="h-3 w-3" strokeWidth={2} aria-hidden />
      {badge.label}
    </span>
  );
}
