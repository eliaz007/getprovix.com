import { ShieldCheck } from "lucide-react";
import { DELIVERY_HYGIENE_VERIFIED_THRESHOLD } from "@/lib/audit-readiness";
import {
  PUBLIC_SCORECARD_THRESHOLD,
  getProductionScoreBadge,
} from "@/lib/production-audit";
import { cn } from "@/lib/cn";

type ProductionScoreVerifiedBadgeProps = {
  score: number | null | undefined;
  /** Optional Delivery Hygiene (0–100) for dual-gate badge labels. */
  deliveryHygieneScore?: number | null;
  className?: string;
};

/**
 * Renders only when Code Health / production score is at or above the public
 * verified threshold (75). Dual-gate label when hygiene is supplied.
 */
export default function ProductionScoreVerifiedBadge({
  score,
  deliveryHygieneScore,
  className = "",
}: ProductionScoreVerifiedBadgeProps) {
  const badge =
    score == null
      ? null
      : getProductionScoreBadge(score, deliveryHygieneScore);

  if (!badge) {
    return null;
  }

  const sparse = badge.label.includes("Sparse History");

  return (
    <span
      title={
        sparse
          ? `Code health ${PUBLIC_SCORECARD_THRESHOLD}+ with sparse commit history`
          : `Code health ${PUBLIC_SCORECARD_THRESHOLD}+ and delivery hygiene ${DELIVERY_HYGIENE_VERIFIED_THRESHOLD}+`
      }
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide shadow-[0_0_12px_rgba(16,185,129,0.15)]",
        sparse
          ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
          : "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
        className
      )}
    >
      <ShieldCheck className="h-3 w-3" strokeWidth={2} aria-hidden />
      {badge.label}
    </span>
  );
}

