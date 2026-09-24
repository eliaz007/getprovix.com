import ProductionScoreVerifiedBadge from "@/components/ProductionScoreVerifiedBadge";
import { productionScoreBadgeClass } from "@/lib/production-audit";
import { clampScore0to100 } from "@/lib/score-scale";

export default function ProductionScoreBadge({
  score,
  verified = true,
}: {
  score: number | null | undefined;
  verified?: boolean;
}) {
  if (score == null || !verified) {
    return null;
  }

  const clamped = clampScore0to100(score);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold tabular-nums ${productionScoreBadgeClass(clamped)}`}
      >
        Production Score: {clamped}/100
      </span>
      <ProductionScoreVerifiedBadge score={clamped} />
    </span>
  );
}
