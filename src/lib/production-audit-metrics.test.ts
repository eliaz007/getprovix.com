import { describe, expect, it } from "vitest";
import {
  classifyRepoActivityStatus,
  scoreCommitHistoryPenalty,
} from "./audit-readiness";
import {
  computeProductionAuditMetrics,
  scoreDevops,
  scoreResilience,
  scoreTesting,
  weightedProductionScore,
} from "./production-audit-metrics";
import {
  capScoreForFilesystemEvidence,
  classifyRepoFilesystem,
  filesystemScoreCeiling,
} from "./repo-filesystem";

const WEB_APP_PATHS = [
  "package.json",
  "tsconfig.json",
  "next.config.ts",
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/lib/auth.ts",
  "eslint.config.mjs",
  ".github/workflows/ci.yml",
  "src/__tests__/smoke.test.ts",
  "src/__tests__/auth.test.ts",
  "src/__tests__/api.test.ts",
];

const LIBRARY_PATHS = [
  "package.json",
  "tsconfig.json",
  "src/index.ts",
  "src/errors.ts",
  "src/client.ts",
  ".github/workflows/ci.yml",
  "src/index.test.ts",
  "src/client.test.ts",
];

describe("four-pillar production audit", () => {
  it("does not cap the overall score at 60 when error handling is missing", () => {
    const filesystem = classifyRepoFilesystem(WEB_APP_PATHS, {
      inspected: true,
    });
    expect(filesystem.repo_kind).toBe("web_app");
    expect(filesystem.error_handling_paths).toHaveLength(0);

    const metrics = computeProductionAuditMetrics(filesystem);
    expect(metrics.resilience).toBe(65);
    expect(metrics.architecture).toBeGreaterThan(60);
    expect(metrics.testing).toBeGreaterThan(0);
    expect(metrics.devops).toBeGreaterThan(0);
    expect(metrics.productionScore).toBe(
      weightedProductionScore({
        architecture: metrics.architecture,
        testing: metrics.testing,
        devops: metrics.devops,
        resilience: metrics.resilience,
      })
    );
    expect(metrics.productionScore).toBeGreaterThan(60);
    expect(filesystemScoreCeiling(filesystem)).toBe(100);
    expect(capScoreForFilesystemEvidence(92, filesystem)).toBe(92);
  });

  it("uses the explicit 35/25/20/20 weighted formula", () => {
    expect(
      weightedProductionScore({
        architecture: 100,
        testing: 80,
        devops: 60,
        resilience: 40,
      })
    ).toBe(Math.round(100 * 0.35 + 80 * 0.25 + 60 * 0.2 + 40 * 0.2));
  });

  it("does not penalize libraries for missing React error boundaries", () => {
    const filesystem = classifyRepoFilesystem(LIBRARY_PATHS, {
      inspected: true,
    });
    expect(filesystem.repo_kind).toBe("library");
    expect(filesystem.error_handling_paths).toContain("src/errors.ts");

    const resilience = scoreResilience(filesystem, "library");
    expect(resilience).toBe(100);
    expect(scoreResilience(filesystem, "web_app")).toBe(65);
  });

  it("deducts missing web-app error boundaries from resilience only", () => {
    const filesystem = classifyRepoFilesystem(
      [...WEB_APP_PATHS, "src/errors.ts"],
      { inspected: true }
    );
    const metrics = computeProductionAuditMetrics(filesystem);
    expect(metrics.evidence.repoKind).toBe("web_app");
    expect(metrics.resilience).toBeGreaterThan(0);
    expect(metrics.resilience).toBeLessThan(75);
    expect(metrics.productionScore).toBeGreaterThan(metrics.resilience);
    expect(capScoreForFilesystemEvidence(metrics.productionScore, filesystem)).toBe(
      metrics.productionScore
    );
  });

  it("does not deduct points for commit inactivity", () => {
    const stale = ["2023-01-01T00:00:00.000Z"];
    expect(scoreCommitHistoryPenalty(stale, Date.parse("2026-09-22"))).toBe(0);
    expect(classifyRepoActivityStatus(stale, Date.parse("2026-09-22"))).toBe(
      "stable"
    );
    expect(
      classifyRepoActivityStatus(
        ["2026-09-20T00:00:00.000Z"],
        Date.parse("2026-09-22")
      )
    ).toBe("active");
  });

  it("grades testing density in proportional bands", () => {
    const filesystem = classifyRepoFilesystem(WEB_APP_PATHS, {
      inspected: true,
    });
    const token = {
      ...filesystem,
      unit_test_file_count: 1,
      source_file_count: 20,
      has_e2e_tools: false,
    };
    const mid = {
      ...filesystem,
      unit_test_file_count: 3,
      source_file_count: 15,
      has_e2e_tools: false,
    };
    const dense = {
      ...filesystem,
      unit_test_file_count: 8,
      source_file_count: 20,
      has_e2e_tools: true,
    };

    expect(scoreTesting({ ...filesystem, unit_test_file_count: 0 })).toBe(0);
    expect(scoreTesting(token)).toBeLessThanOrEqual(35);
    expect(scoreTesting(token)).toBeGreaterThan(0);
    expect(scoreTesting(mid)).toBeGreaterThanOrEqual(65);
    expect(scoreTesting(mid)).toBeLessThanOrEqual(75);
    expect(scoreTesting(dense)).toBeGreaterThanOrEqual(85);
  });

  it("grades devops by pipeline depth instead of a binary drop", () => {
    const filesystem = classifyRepoFilesystem(WEB_APP_PATHS, {
      inspected: true,
    });
    expect(scoreDevops({ ...filesystem, ci_workflow_paths: [], ci_depth: "none" })).toBe(0);
    expect(
      scoreDevops({ ...filesystem, ci_depth: "lint_build" })
    ).toBe(50);
    expect(scoreDevops({ ...filesystem, ci_depth: "tests" })).toBe(80);
    expect(scoreDevops({ ...filesystem, ci_depth: "deploy" })).toBeGreaterThanOrEqual(95);
  });

  it("applies a 15-point resilience ding for one unhandled async call", () => {
    const filesystem = classifyRepoFilesystem(
      [...WEB_APP_PATHS, "src/app/error.tsx"],
      { inspected: true }
    );
    expect(
      scoreResilience({ ...filesystem, unhandled_async_count: 1 }, "web_app")
    ).toBe(85);
    expect(
      scoreResilience({ ...filesystem, unhandled_async_count: 4 }, "web_app")
    ).toBe(50);
  });
});
