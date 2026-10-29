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

export function metricIssueCount(score: number, foundCount: number): number {
  if (!foundCount) {
    return score > 0 ? 0 : 1;
  }
  return score >= 60 ? 0 : Math.max(1, Math.min(foundCount, 3));
}

type ProductionScorecardProps = {
  metrics?: ProductionAuditMetrics | null;
  className?: string;
  /** Dense single-row layout for profile settings / tight result panels. */
  compact?: boolean;
  /** Live rank against completed production audits. Hidden math stays off the compact card. */
  benchmark?: CodebaseBenchmark | null;
  executiveBrief?: ExecutiveBrief | null;
  /** Employer dossiers lead with the founder brief. Candidate audits lead with the peer review. */
  audience?: "candidate" | "employer";
  /** Terminal-style forensic receipts under each pillar (non-compact dossier). */
  pillarSubLogs?: PillarSubLog[] | null;
  /** Shown under Founder Hiring Verdict when History blocks Provix Verified. */
  historyVerifiedNote?: string | null;
};

/** Split a 2–3 sentence brief into tight executive bullets. */
