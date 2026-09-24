import { describe, expect, it } from "vitest";
import {
  codebaseTopPercentile,
  formatCodebaseBenchmark,
  VERIFIED_ENGINEERING_BENCHMARK,
} from "./codebase-benchmark";

describe("codebase benchmark percentile", () => {
  it("ranks a lone leader as the top 1%", () => {
    expect(codebaseTopPercentile(100, 99)).toBe(1);
  });

  it("uses the share of audits at or above the current score", () => {
    expect(codebaseTopPercentile(100, 50)).toBe(50);
  });

  it("never reports 0%", () => {
    expect(codebaseTopPercentile(10, 10)).toBe(1);
    expect(codebaseTopPercentile(0, 0)).toBe(1);
  });

  it("falls back until ten completed audits exist", () => {
    expect(
      formatCodebaseBenchmark({ topPercentile: 12, totalAudits: 9 })
    ).toBe(VERIFIED_ENGINEERING_BENCHMARK);
    expect(
      formatCodebaseBenchmark({ topPercentile: 12, totalAudits: 10 })
    ).toBe("Top 12% Codebase Benchmark (n = 10 audited repos)");
  });
});
