import { describe, expect, it } from "vitest";
import {
  applyUpstreamDerivativePenalty,
  computeProductionAuditMetrics,
  PRODUCTION_METRIC_WEIGHTS,
  scoreArchitecture,
  scoreDevops,
  scoreResilience,
  scoreTesting,
  UPSTREAM_DERIVATIVE_PENALTY,
  weightedProductionScore,
} from "@/lib/production-audit-metrics";
import { classifyRepoFilesystem } from "@/lib/repo-filesystem";
import { clampScore0to100, scoreBarWidthPercent } from "@/lib/score-scale";

describe("auditor scoring and weighting math", () => {
  it("uses the four-pillar 35/25/20/20 production weights", () => {
    const weightSum =
      PRODUCTION_METRIC_WEIGHTS.architecture +
      PRODUCTION_METRIC_WEIGHTS.testing +
      PRODUCTION_METRIC_WEIGHTS.devops +
      PRODUCTION_METRIC_WEIGHTS.resilience;

    expect(weightSum).toBeCloseTo(1);
    expect(PRODUCTION_METRIC_WEIGHTS).toEqual({
      architecture: 0.35,
      testing: 0.25,
      devops: 0.2,
      resilience: 0.2,
    });

    expect(
      weightedProductionScore({
        architecture: 80,
        testing: 60,
        devops: 40,
        resilience: 20,
      })
    ).toBe(Math.round(80 * 0.35 + 60 * 0.25 + 40 * 0.2 + 20 * 0.2));
  });

  it("clamps headline scores and applies the upstream fork penalty", () => {
    expect(clampScore0to100(142)).toBe(100);
    expect(clampScore0to100(-3)).toBe(0);
    expect(clampScore0to100("67")).toBe(67);
    expect(scoreBarWidthPercent(110)).toBe("100%");

    expect(applyUpstreamDerivativePenalty(88, false)).toBe(88);
    expect(applyUpstreamDerivativePenalty(88, true)).toBe(
      88 - UPSTREAM_DERIVATIVE_PENALTY
    );
    expect(applyUpstreamDerivativePenalty(10, true)).toBe(0);
    expect(UPSTREAM_DERIVATIVE_PENALTY).toBe(30);
  });

  it("computes pillar scores from an inspected repository file tree", () => {
    const filesystem = classifyRepoFilesystem(
      [
        "package.json",
        "tsconfig.json",
        "next.config.ts",
        "eslint.config.mjs",
        "src/app/layout.tsx",
        "src/app/page.tsx",
        "src/app/error.tsx",
        "src/lib/auth.ts",
        "src/lib/auth.test.ts",
        "src/lib/client.test.ts",
        ".github/workflows/ci.yml",
      ],
      { inspected: true }
    );

    const architecture = scoreArchitecture(filesystem);
    const testing = scoreTesting(filesystem);
    const devops = scoreDevops(filesystem);
    const resilience = scoreResilience(filesystem, filesystem.repo_kind);
    const metrics = computeProductionAuditMetrics(filesystem);

    expect(filesystem.repo_kind).toBe("web_app");
    expect(architecture).toBeGreaterThan(0);
    expect(architecture).toBeLessThanOrEqual(82);
    expect(testing).toBeGreaterThan(0);
    expect(devops).toBeGreaterThan(0);
    expect(resilience).toBeGreaterThan(0);
    expect(metrics.productionScore).toBe(
      weightedProductionScore({
        architecture: metrics.architecture,
        testing: metrics.testing,
        devops: metrics.devops,
        resilience: metrics.resilience,
      })
    );
    expect(metrics.weights.architecture).toBe(0.35);
  });
});
