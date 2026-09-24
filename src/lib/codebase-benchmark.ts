import type { SupabaseClient } from "@supabase/supabase-js";
import { clampScore0to100 } from "@/lib/score-scale";

/** Completed production audits. This schema stores them on `production_audit_history`. */
const AUDITS_TABLE = "production_audit_history";

export const CODEBASE_BENCHMARK_MIN_SAMPLE = 10;

export const VERIFIED_ENGINEERING_BENCHMARK = "Verified Engineering Benchmark";

export type CodebaseBenchmark = {
  topPercentile: number;
  totalAudits: number;
};

/**
 * Share of completed audits at or above the current score, as a top-percentile.
 * `lowerCount` is rows with production_score < current score.
 */
export function codebaseTopPercentile(
  totalAudits: number,
  lowerCount: number
): number {
  if (!Number.isFinite(totalAudits) || totalAudits <= 0) {
    return 1;
  }

  const lower = Number.isFinite(lowerCount)
    ? Math.max(0, Math.min(totalAudits, lowerCount))
    : 0;

  return Math.max(
    1,
    Math.round(((totalAudits - lower) / totalAudits) * 100)
  );
}

export function formatCodebaseBenchmark(
  benchmark: CodebaseBenchmark | null | undefined
): string {
  if (!benchmark || benchmark.totalAudits < CODEBASE_BENCHMARK_MIN_SAMPLE) {
    return VERIFIED_ENGINEERING_BENCHMARK;
  }

  return `Top ${benchmark.topPercentile}% Codebase Benchmark (n = ${benchmark.totalAudits} audited repos)`;
}

export async function loadCodebaseBenchmark(
  supabase: SupabaseClient,
  currentScore: number
): Promise<CodebaseBenchmark | null> {
  const score = clampScore0to100(currentScore);

  const [totalResult, lowerResult] = await Promise.all([
    supabase
      .from(AUDITS_TABLE)
      .select("id", { count: "exact", head: true }),
    supabase
      .from(AUDITS_TABLE)
      .select("id", { count: "exact", head: true })
      .lt("production_score", score),
  ]);

  if (totalResult.error || lowerResult.error) {
    console.error(
      "[audit] codebase benchmark query failed:",
      totalResult.error ?? lowerResult.error
    );
    return null;
  }

  const totalAudits = totalResult.count ?? 0;
  const lowerCount = lowerResult.count ?? 0;

  return {
    totalAudits,
    topPercentile: codebaseTopPercentile(totalAudits, lowerCount),
  };
}
