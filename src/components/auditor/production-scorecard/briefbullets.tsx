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

export /** Split a 2–3 sentence brief into tight executive bullets. */
function briefBullets(summary: string): string[] {
  const cleaned = summary.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return [];
  }

  const chunks = cleaned
    .split(/\n+|(?:^|\s)[•]\s+|(?:^|\s)[-*]\s+/)
    .flatMap((chunk) =>
      chunk
        .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
    );

  return chunks.length > 0 ? chunks : [cleaned];
}
