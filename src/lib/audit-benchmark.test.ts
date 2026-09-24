import { describe, expect, it } from "vitest";
import {
  AUDIT_BENCHMARK_MIN_SAMPLE,
  computeTopPercentile,
  formatAuditBenchmarkLabel,
} from "./audit-benchmark";

describe("computeTopPercentile", () => {
  it("returns null when there are no audits", () => {
    expect(computeTopPercentile(80, 0, 0)).toBeNull();
  });

  it("ranks a unique top score as Top 1%", () => {
    expect(computeTopPercentile(95, 100, 99)).toEqual({
      topPercentile: 1,
      totalAudits: 100,
      lowerCount: 99,
    });
  });

  it("ranks the lowest score as Top 100%", () => {
    expect(computeTopPercentile(10, 50, 0)).toEqual({
      topPercentile: 100,
      totalAudits: 50,
      lowerCount: 0,
    });
  });

  it("uses the documented ((total - lower) / total) * 100 formula", () => {
    // 70 of 100 scored lower → (100-70)/100 = 30% from the top
    expect(computeTopPercentile(83, 100, 70)?.topPercentile).toBe(30);
  });

  it("never reports a top percentile below 1", () => {
    expect(computeTopPercentile(100, 1000, 999)?.topPercentile).toBe(1);
  });
});

describe("formatAuditBenchmarkLabel", () => {
  it("falls back when sample is below the minimum", () => {
    const small = computeTopPercentile(90, AUDIT_BENCHMARK_MIN_SAMPLE - 1, 8);
    expect(formatAuditBenchmarkLabel(small)).toEqual({
      text: "Verified Engineering Benchmark",
      hasPercentile: false,
    });
  });

  it("shows Top X% once the sample is large enough", () => {
    const ready = computeTopPercentile(88, 40, 36);
    expect(formatAuditBenchmarkLabel(ready)).toEqual({
      text: "Top 10% Codebase Benchmark (n = 40 audited repos)",
      hasPercentile: true,
    });
  });

  it("falls back for null/undefined benchmarks", () => {
    expect(formatAuditBenchmarkLabel(null).hasPercentile).toBe(false);
    expect(formatAuditBenchmarkLabel(undefined).text).toBe(
      "Verified Engineering Benchmark"
    );
  });
});
