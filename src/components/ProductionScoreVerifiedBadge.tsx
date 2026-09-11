import { Check } from "lucide-react";
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
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide",
        badge.className,
        className
      )}
    >
      <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
      {badge.label}
    </span>
  );
}
