import { createServiceRoleClient } from "@/lib/admin-access";
import { clampScore0to100 } from "@/lib/score-scale";

/** Minimum completed audits before a Top X% claim is shown. */
export const AUDIT_BENCHMARK_MIN_SAMPLE = 10;

/**
 * Completed production audits live in `production_audit_history`
 * (append-only rows with production_score). There is no separate
 * `audits` table — this is the ranking population.
 */
export const AUDIT_BENCHMARK_TABLE = "production_audit_history" as const;

export type AuditScoreBenchmark = {
  topPercentile: number;
  totalAudits: number;
  lowerCount: number;
};

export type AuditBenchmarkLabel = {
  text: string;
  /** True when sample is large enough for a Top X% claim. */
  hasPercentile: boolean;
};

/**
 * topPercentile = max(1, round(((total - lower) / total) * 100))
 * where lower = count of audits with production_score < current.
 */
export function computeTopPercentile(
  currentScore: number,
  totalAudits: number,
  lowerCount: number
): AuditScoreBenchmark | null {
  const total = Math.max(0, Math.floor(totalAudits));
  if (total <= 0) {
    return null;
  }

  const lower = Math.max(0, Math.min(total, Math.floor(lowerCount)));
  const topPercentile = Math.max(
    1,
    Math.round(((total - lower) / total) * 100)
  );

  return {
    topPercentile,
    totalAudits: total,
    lowerCount: lower,
  };
}

export function formatAuditBenchmarkLabel(
  benchmark: AuditScoreBenchmark | null | undefined
): AuditBenchmarkLabel {
  if (
    !benchmark ||
    benchmark.totalAudits < AUDIT_BENCHMARK_MIN_SAMPLE ||
    !Number.isFinite(benchmark.topPercentile)
  ) {
    return {
      text: "Verified Engineering Benchmark",
      hasPercentile: false,
    };
  }

  return {
    text: `Top ${benchmark.topPercentile}% Codebase Benchmark (n = ${benchmark.totalAudits} audited repos)`,
    hasPercentile: true,
  };
}

/**
 * Rank `currentScore` against completed production audits in Supabase.
 * Uses the service role so ranking is global (RLS is per-user on history).
 */
export async function fetchAuditScoreBenchmark(
  currentScore: number
): Promise<AuditScoreBenchmark | null> {
  const score = clampScore0to100(currentScore);
  const admin = createServiceRoleClient();
  if (!admin) {
    return null;
  }

  try {
    const [totalResult, lowerResult] = await Promise.all([
      admin
        .from(AUDIT_BENCHMARK_TABLE)
        .select("id", { count: "exact", head: true }),
      admin
        .from(AUDIT_BENCHMARK_TABLE)
        .select("id", { count: "exact", head: true })
        .lt("production_score", score),
    ]);

    if (totalResult.error) {
      console.error(
        "[audit-benchmark] total count failed:",
        totalResult.error.message
      );
      return null;
    }
    if (lowerResult.error) {
      console.error(
        "[audit-benchmark] lower count failed:",
        lowerResult.error.message
      );
      return null;
    }

    const totalAudits = totalResult.count ?? 0;
    const lowerCount = lowerResult.count ?? 0;
    return computeTopPercentile(score, totalAudits, lowerCount);
  } catch (error) {
    console.error("[audit-benchmark] ranking query threw:", error);
    return null;
  }
}
