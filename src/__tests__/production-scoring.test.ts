import { describe, expect, it } from "vitest";
import {
  applyUpstreamDerivativePenalty,
  computeProductionAuditMetrics,
  PRODUCTION_METRIC_WEIGHTS,
  scoreArchitecture,
  scoreResilience,
  scoreTesting,
  UPSTREAM_DERIVATIVE_PENALTY,
  weightedProductionScore,
} from "@/lib/production-audit-metrics";
import { classifyRepoFilesystem } from "@/lib/repo-filesystem";

describe("core production scoring", () => {
  it("weights pillars at 35/25/20/20", () => {
    expect(PRODUCTION_METRIC_WEIGHTS).toEqual({
      architecture: 0.35,
      testing: 0.25,
      devops: 0.2,
      resilience: 0.2,
    });
    expect(
      weightedProductionScore({
        architecture: 100,
        testing: 80,
        devops: 60,
        resilience: 40,
      })
    ).toBe(Math.round(100 * 0.35 + 80 * 0.25 + 60 * 0.2 + 40 * 0.2));
  });

  it("caps scaffold architecture and floors upstream forks", () => {
    const filesystem = classifyRepoFilesystem(
      [
        "package.json",
        "tsconfig.json",
        "next.config.ts",
        "src/app/layout.tsx",
        "src/app/page.tsx",
        "eslint.config.mjs",
      ],
      { inspected: true }
    );

    expect(scoreArchitecture(filesystem)).toBeLessThanOrEqual(82);
    expect(applyUpstreamDerivativePenalty(70, true)).toBe(
      70 - UPSTREAM_DERIVATIVE_PENALTY
    );
    expect(applyUpstreamDerivativePenalty(20, true)).toBe(0);
    expect(applyUpstreamDerivativePenalty(70, false)).toBe(70);
  });

  it("scores testing and resilience from inspected evidence", () => {
    const filesystem = classifyRepoFilesystem(
      [
        "package.json",
        "tsconfig.json",
        "src/index.ts",
        "src/client.ts",
        "src/index.test.ts",
        "src/app/error.tsx",
        ".github/workflows/ci.yml",
      ],
      { inspected: true }
    );
    const metrics = computeProductionAuditMetrics(filesystem);

    expect(scoreTesting(filesystem)).toBeGreaterThan(0);
    expect(scoreResilience(filesystem, filesystem.repo_kind)).toBeGreaterThan(
      0
    );
    expect(metrics.productionScore).toBe(
      weightedProductionScore({
        architecture: metrics.architecture,
        testing: metrics.testing,
        devops: metrics.devops,
        resilience: metrics.resilience,
      })
    );
  });
});
