"use client";
import ProductionScoreVerifiedBadge from "@/components/ProductionScoreVerifiedBadge";
import type { ExecutiveBrief, RecommendedRoleBand } from "@/lib/executive-brief";
import type { PillarSubLog } from "@/lib/forensic-dossier";
import {
  type ProductionAuditMetrics,
  emptyProductionAuditMetrics,
  resolveCodeHealthScore,
  weightedProductionScore,
} from "@/lib/production-audit-metrics";
import { formatCodebaseBenchmark, type CodebaseBenchmark } from "@/lib/codebase-benchmark";
import { clampScore0to100 } from "@/lib/score-scale";
import { briefBullets } from "./briefbullets";

export function BriefBulletList({ summary }: { summary: string }) {
  const bullets = briefBullets(summary);

  return (
    <ul className="mt-2 space-y-1 text-[12px] leading-snug text-zinc-200 print:mt-1 print:space-y-0.5 print:text-[10px] print:leading-tight">
      {bullets.map((item, index) => (
        <li
          key={`${index}-${item.slice(0, 32)}`}
          className="dossier-bullet flex items-start gap-1.5"
        >
          <span aria-hidden className="leading-snug">
            •
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
