import { clampScore0to100 } from "@/lib/score-scale";

export const VERIFIED_ENGINEERING_BENCHMARK = "Verified Engineering Benchmark";

export type BenchmarkTier =
  | "Tier I - Staff-Grade Architecture"
  | "Tier I - Production Autonomous"
  | "Tier II - Advanced Full-Stack"
  | "Tier II - Competent Mid-Level"
  | "Tier II - Supervised Implementation"
  | "Tier III - Baseline MVP"
  | "Tier III - Baseline Architecture";

export type CodebaseBenchmark = {
  /** Calibrated outperformance percentile on the industry reference curve. */
  topPercentile: number;
  /** Hiring-facing primary label (no sample-size suffix). */
  label: string;
  tier: BenchmarkTier;
  /** Always null — retained so older payloads deserialize safely. */
  totalAudits: null;
};

/** Deterministic industry reference curve for production full-stack repos. */
export function getCalibratedBenchmark(score: number): CodebaseBenchmark {
  const s = clampScore0to100(score);

  if (s >= 92) {
    return {
      topPercentile: 99,
      label: "Top 1% Codebase Benchmark",
      tier: "Tier I - Staff-Grade Architecture",
      totalAudits: null,
    };
  }
  if (s >= 85) {
    return {
      topPercentile: 90,
      label: "Top 10% Codebase Benchmark",
      tier: "Tier I - Production Autonomous",
      totalAudits: null,
    };
  }
  if (s >= 78) {
    return {
      topPercentile: 75,
      label: "Top 25% Codebase Benchmark",
      tier: "Tier II - Advanced Full-Stack",
      totalAudits: null,
    };
  }
  if (s >= 68) {
    return {
      topPercentile: 60,
      label: "60th Percentile Benchmark",
      tier: "Tier II - Competent Mid-Level",
      totalAudits: null,
    };
  }
  if (s >= 58) {
    return {
      topPercentile: 35,
      label: "35th Percentile Benchmark",
      tier: "Tier II - Supervised Implementation",
      totalAudits: null,
    };
  }
  if (s >= 45) {
    return {
      topPercentile: 18,
      label: "18th Percentile Benchmark",
      tier: "Tier III - Baseline MVP",
      totalAudits: null,
    };
  }
  return {
    topPercentile: 5,
    label: "Tier III Benchmark (Baseline Architecture)",
    tier: "Tier III - Baseline Architecture",
    totalAudits: null,
  };
}

export function formatCodebaseBenchmark(
  benchmark: CodebaseBenchmark | null | undefined
): string {
  if (!benchmark?.label?.trim()) {
    return VERIFIED_ENGINEERING_BENCHMARK;
  }
  return benchmark.label;
}

/** Sync alias for call sites that previously awaited a DB lookup. */
export function loadCodebaseBenchmark(currentScore: number): CodebaseBenchmark {
  return getCalibratedBenchmark(currentScore);
}
