import { describe, expect, it } from "vitest";
import {
  formatCodebaseBenchmark,
  getCalibratedBenchmark,
  VERIFIED_ENGINEERING_BENCHMARK,
} from "./codebase-benchmark";

describe("calibrated codebase benchmark", () => {
  it("maps score bands to industry reference labels", () => {
    expect(getCalibratedBenchmark(95).label).toBe("Top 1% Codebase Benchmark");
    expect(getCalibratedBenchmark(85).label).toBe("Top 10% Codebase Benchmark");
    expect(getCalibratedBenchmark(78).label).toBe("Top 25% Codebase Benchmark");
    expect(getCalibratedBenchmark(68).label).toBe("60th Percentile Benchmark");
    expect(getCalibratedBenchmark(58).label).toBe("35th Percentile Benchmark");
    expect(getCalibratedBenchmark(45).label).toBe("18th Percentile Benchmark");
    expect(getCalibratedBenchmark(44).label).toBe(
      "Tier III Benchmark (Baseline Architecture)"
    );
  });

  it("never includes live sample-size suffixes", () => {
    for (const score of [95, 85, 78, 68, 58, 45, 20]) {
      const label = getCalibratedBenchmark(score).label;
      expect(label).not.toMatch(/\(n\s*=/);
      expect(label).not.toMatch(/audited repos/i);
    }
  });

  it("formats null as the verified fallback", () => {
    expect(formatCodebaseBenchmark(null)).toBe(VERIFIED_ENGINEERING_BENCHMARK);
    expect(formatCodebaseBenchmark(undefined)).toBe(
      VERIFIED_ENGINEERING_BENCHMARK
    );
  });

  it("formats calibrated labels directly", () => {
    expect(formatCodebaseBenchmark(getCalibratedBenchmark(90))).toBe(
      "Top 10% Codebase Benchmark"
    );
  });
});
