import { ShieldCheck } from "lucide-react";
import {
  PUBLIC_SCORECARD_THRESHOLD,
  getProductionScoreBadge,
} from "@/lib/production-audit";
import { cn } from "@/lib/cn";

type ProductionScoreVerifiedBadgeProps = {
  score: number | null | undefined;
  className?: string;
};

/**
 * Renders only when Production Score is at or above the public verified
 * threshold (75). Hidden automatically if the score later drops below it.
 */
export default function ProductionScoreVerifiedBadge({
  score,
  className = "",
}: ProductionScoreVerifiedBadgeProps) {
  const badge = score == null ? null : getProductionScoreBadge(score);

  if (!badge) {
    return null;
  }

  return (
    <span
      title={`Production score of ${PUBLIC_SCORECARD_THRESHOLD}+`}
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

