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

export function roleBandClass(band: RecommendedRoleBand): string {
  if (
    band === "Elite Sprint Contractor" ||
    band === "Production-Grade / Core Lead"
  ) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (
    band === "Verified Sprint Builder" ||
    band === "Mid/Senior Production-Ready"
  ) {
    return "border-cyan-500/30 bg-cyan-500/10 text-cyan-200";
  }
  if (band === "Supervised Feature Builder") {
    return "border-violet-500/30 bg-violet-500/10 text-violet-200";
  }
  if (band === "Needs Refinement") {
    return "border-orange-500/30 bg-orange-500/10 text-orange-200";
  }
  return "border-rose-500/30 bg-rose-500/10 text-rose-200";
}
