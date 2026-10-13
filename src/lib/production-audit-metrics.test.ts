import { describe, expect, it } from "vitest";
import {
  classifyRepoActivityStatus,
  scoreCommitHistoryPenalty,
} from "./audit-readiness";
import {
  applyUpstreamDerivativePenalty,
  computeProductionAuditMetrics,
  scoreArchitecture,
  scoreDevops,
  scoreResilience,
  scoreTesting,
  unhandledAsyncPenalty,
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
    // Missing error.tsx is a moderate −15 ding, not a collapse to the teens.
    expect(metrics.resilience).toBe(85);
    expect(metrics.architecture).toBeGreaterThan(60);
    expect(metrics.architecture).toBeLessThanOrEqual(82);
    expect(metrics.testing).toBeGreaterThan(0);
    expect(metrics.devops).toBeGreaterThan(0);
    expect(metrics.productionScore).toBe(
      weightedProductionScore(
        {
          architecture: metrics.architecture,
          testing: metrics.testing,
          devops: metrics.devops,
          resilience: metrics.resilience,
        },
        "contract"
      )
    );
    expect(metrics.productionScore).toBeGreaterThan(60);
    expect(filesystemScoreCeiling(filesystem)).toBe(100);
    expect(capScoreForFilesystemEvidence(92, filesystem)).toBe(92);
  });

  it("uses the explicit fulltime 30/25/15/30 weighted formula", () => {
    expect(
      weightedProductionScore(
        {
          architecture: 100,
          testing: 80,
          devops: 60,
          resilience: 40,
        },
        "fulltime"
      )
    ).toBe(Math.round(100 * 0.3 + 80 * 0.3 + 60 * 0.15 + 40 * 0.25));
  });

  it("does not penalize libraries for missing React error boundaries", () => {
    const filesystem = classifyRepoFilesystem(LIBRARY_PATHS, {
      inspected: true,
    });
    expect(filesystem.repo_kind).toBe("library");
    expect(filesystem.error_handling_paths).toContain("src/errors.ts");

    const resilience = scoreResilience(filesystem, "library", "contract");
    expect(resilience).toBe(100);
    expect(scoreResilience(filesystem, "web_app", "contract")).toBe(85);
    expect(scoreResilience(filesystem, "web_app", "fulltime")).toBe(70);
  });

  it("deducts missing web-app error boundaries from resilience only", () => {
    const filesystem = classifyRepoFilesystem(
      [...WEB_APP_PATHS, "src/errors.ts"],
      { inspected: true }
    );
    const metrics = computeProductionAuditMetrics(filesystem);
    expect(metrics.evidence.repoKind).toBe("web_app");
    expect(metrics.resilience).toBeGreaterThanOrEqual(50);
    expect(metrics.resilience).toBeLessThan(100);
    expect(
      scoreResilience(
        {
          ...filesystem,
          error_handling_paths: ["src/app/error.tsx", "src/errors.ts"],
        },
        "web_app"
      )
    ).toBeGreaterThan(metrics.resilience);
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
      executable_source_count: 20,
      has_e2e_tools: false,
    };
    const mid = {
      ...filesystem,
      unit_test_file_count: 3,
      source_file_count: 15,
      executable_source_count: 15,
      has_e2e_tools: false,
    };
    const dense = {
      ...filesystem,
      unit_test_file_count: 8,
      source_file_count: 20,
      executable_source_count: 20,
      has_e2e_tools: true,
    };
    const e2eHeavy = {
      ...filesystem,
      unit_test_file_count: 50,
      executable_source_count: 80,
      has_e2e_tools: true,
    };
    const thinLarge = {
      ...filesystem,
      unit_test_file_count: 2,
      executable_source_count: 60,
      has_e2e_tools: false,
    };

    expect(scoreTesting({ ...filesystem, unit_test_file_count: 0 })).toBe(0);
    expect(scoreTesting(token)).toBeLessThan(20);
    expect(scoreTesting(token)).toBeGreaterThan(0);
    expect(scoreTesting(mid)).toBeGreaterThanOrEqual(65);
    expect(scoreTesting(mid)).toBeLessThanOrEqual(75);
    expect(scoreTesting(dense)).toBeGreaterThanOrEqual(85);
    expect(scoreTesting(e2eHeavy)).toBeGreaterThanOrEqual(85);
    expect(scoreTesting(e2eHeavy)).toBeLessThanOrEqual(95);
    expect(scoreTesting(thinLarge)).toBeLessThanOrEqual(15);
  });

  it("excludes demo, sample, and docs trees from the test-to-source denominator", () => {
    const bloated = classifyRepoFilesystem(
      [
        ...LIBRARY_PATHS,
        "examples/basic/index.ts",
        "examples/basic/widget.tsx",
        "examples/basic/widget.test.ts",
        "demo/playground.ts",
        "demos/showcase/App.tsx",
        "tutorial/getting-started.ts",
        "tutorials/advanced/main.ts",
        "samples/hello.ts",
        "docs/guide.ts",
        "example/legacy.ts",
      ],
      { inspected: true }
    );
    const coreOnly = classifyRepoFilesystem(LIBRARY_PATHS, { inspected: true });

    expect(bloated.executable_source_count).toBe(
      coreOnly.executable_source_count
    );
    expect(bloated.source_file_count).toBe(coreOnly.source_file_count);
    expect(bloated.unit_test_file_count).toBe(coreOnly.unit_test_file_count);
    expect(bloated.test_paths).toEqual(coreOnly.test_paths);
    expect(scoreTesting(bloated)).toBe(scoreTesting(coreOnly));
  });

  it("grades devops proportionally from aggregated CI gates", () => {
    const filesystem = classifyRepoFilesystem(WEB_APP_PATHS, {
      inspected: true,
    });
    expect(scoreDevops({ ...filesystem, ci_workflow_paths: [], ci_depth: "none" })).toBe(0);
    expect(
      scoreDevops({ ...filesystem, ci_depth: "lint_build" })
    ).toBeGreaterThanOrEqual(20);
    expect(
      scoreDevops({ ...filesystem, ci_depth: "lint_build" })
    ).toBeLessThanOrEqual(30);
    expect(scoreDevops({ ...filesystem, ci_depth: "tests" })).toBe(30);
    expect(
      scoreDevops({
        ...filesystem,
        ci_depth: "lint_build",
        ci_has_lint: true,
        ci_has_tests: false,
        ci_has_build: false,
      })
    ).toBeGreaterThanOrEqual(65);
    expect(
      scoreDevops({
        ...filesystem,
        ci_depth: "tests",
        ci_has_lint: false,
        ci_has_tests: true,
        ci_has_build: true,
      })
    ).toBeGreaterThanOrEqual(78);
    expect(
      scoreDevops({
        ...filesystem,
        ci_depth: "tests",
        ci_has_lint: false,
        ci_has_tests: true,
        ci_has_build: true,
      })
    ).toBeLessThanOrEqual(84);
    expect(
      scoreDevops({
        ...filesystem,
        ci_depth: "tests",
        ci_has_lint: true,
        ci_has_tests: true,
        ci_has_build: true,
      })
    ).toBeGreaterThanOrEqual(90);
    expect(
      scoreDevops({
        ...filesystem,
        ci_depth: "deploy",
        ci_has_lint: true,
        ci_has_tests: true,
        ci_has_build: true,
        ci_has_deploy: true,
      })
    ).toBeGreaterThanOrEqual(95);
    expect(
      scoreDevops({
        ...filesystem,
        architecture_paths: ["turbo.json"],
        ci_workflow_paths: [
          ".github/workflows/ci.yml",
          ".github/workflows/release.yml",
        ],
        ci_has_monorepo_pipeline: true,
      })
    ).toBeGreaterThanOrEqual(90);
  });

  it("caps resilience when routes use type assertions without schema parsing", () => {
    const filesystem = classifyRepoFilesystem(
      [...WEB_APP_PATHS, "src/app/error.tsx", "src/app/api/audit/route.ts"],
      { inspected: true }
    );
    expect(
      scoreResilience(
        {
          ...filesystem,
          route_contracts_sampled: true,
          route_schema_validation: false,
          unvalidated_type_assertions: 4,
          has_contract_boundaries: false,
        },
        "web_app"
      )
    ).toBeLessThanOrEqual(65);
  });

  it("allows architecture above 85 only with proven route contracts", () => {
    const filesystem = classifyRepoFilesystem(WEB_APP_PATHS, {
      inspected: true,
    });
    expect(scoreArchitecture(filesystem)).toBeLessThanOrEqual(82);
    expect(
      scoreArchitecture({
        ...filesystem,
        route_contracts_sampled: true,
        route_schema_validation: true,
        unvalidated_type_assertions: 0,
        has_contract_boundaries: true,
      })
    ).toBeGreaterThanOrEqual(85);
  });

  it("applies an 8-point resilience ding for one unhandled async call on small repos", () => {
    const filesystem = classifyRepoFilesystem(
      [...WEB_APP_PATHS, "src/app/error.tsx"],
      { inspected: true }
    );
    // Pass a mid testing score so the high-coverage soft-cap does not apply.
    expect(
      scoreResilience(
        { ...filesystem, unhandled_async_count: 1 },
        "web_app",
        "contract",
        60
      )
    ).toBe(92);
    expect(
      scoreResilience(
        { ...filesystem, unhandled_async_count: 4 },
        "web_app",
        "contract",
        60
      )
    ).toBe(76);
  });

  it("scales async penalties by incident rate on large monorepos", () => {
    const filesystem = classifyRepoFilesystem(
      [...WEB_APP_PATHS, "src/app/error.tsx", "src/lib/api/errors.ts"],
      { inspected: true }
    );
    const dubLike = {
      ...filesystem,
      file_count: 1995,
      source_file_count: 1600,
      executable_source_count: 1600,
      unhandled_async_count: 10,
      error_handling_paths: [
        "src/app/error.tsx",
        "src/lib/api/errors.ts",
      ],
    };
    // 10 / 1995 ≈ 0.5% → ~2 points, soft-capped by centralized errors.
    expect(unhandledAsyncPenalty(dubLike, 10, 90)).toBeLessThanOrEqual(12);
    expect(unhandledAsyncPenalty(dubLike, 10, 90)).toBeLessThanOrEqual(4);
    expect(scoreResilience(dubLike, "web_app", "contract", 90)).toBeGreaterThanOrEqual(
      96
    );
  });

  it("soft-caps async penalty at 12 when Testing >= 85", () => {
    const filesystem = classifyRepoFilesystem(
      [...WEB_APP_PATHS, "src/app/error.tsx"],
      { inspected: true }
    );
    const smallButWellTested = {
      ...filesystem,
      unhandled_async_count: 10,
    };
    expect(unhandledAsyncPenalty(smallButWellTested, 10, 40)).toBe(24);
    expect(unhandledAsyncPenalty(smallButWellTested, 10, 85)).toBe(12);
  });

  it("keeps Contract resilience at or above 50 for clean structure despite heavy async gaps", () => {
    const filesystem = classifyRepoFilesystem(WEB_APP_PATHS, {
      inspected: true,
    });
    expect(
      scoreResilience(
        { ...filesystem, unhandled_async_count: 10 },
        "web_app",
        "contract"
      )
    ).toBeGreaterThanOrEqual(50);
  });

  it("does not apply a resilience structure floor in Full-Time mode", () => {
    const filesystem = classifyRepoFilesystem(WEB_APP_PATHS, {
      inspected: true,
    });
    expect(
      scoreResilience(
        { ...filesystem, unhandled_async_count: 10 },
        "web_app",
        "fulltime",
        40
      )
    ).toBeLessThan(50);
  });

  it("scales Full-Time testing under a 50 cap when test files are under 25% of source", () => {
    const filesystem = classifyRepoFilesystem(WEB_APP_PATHS, {
      inspected: true,
    });
    const sparse = {
      ...filesystem,
      unit_test_file_count: 5,
      source_file_count: 32,
      executable_source_count: 32,
      has_e2e_tools: false,
    };
    expect(scoreTesting(sparse, "contract")).toBeGreaterThan(50);
    expect(scoreTesting(sparse, "fulltime")).toBeLessThanOrEqual(50);
    expect(scoreTesting(sparse, "fulltime")).toBe(
      Math.round((5 / 32 / 0.25) * 50)
    );
  });

  it("scores thin-test web apps ~76 Contract vs ~58-64 Full-Time", () => {
    const filesystem = classifyRepoFilesystem(WEB_APP_PATHS, {
      inspected: true,
    });
    const carfaxLike = {
      ...filesystem,
      unit_test_file_count: 5,
      source_file_count: 32,
      executable_source_count: 32,
      has_e2e_tools: false,
      error_handling_paths: [] as string[],
      unhandled_async_count: 2,
      ci_has_lint: true,
      ci_has_tests: true,
      ci_has_build: true,
      ci_depth: "lint_build" as const,
    };

    const contract = computeProductionAuditMetrics(carfaxLike, "contract");
    const fulltime = computeProductionAuditMetrics(carfaxLike, "fulltime");

    expect(contract.architecture).toBeGreaterThanOrEqual(75);
    expect(contract.devops).toBeGreaterThanOrEqual(85);
    expect(contract.resilience).toBeGreaterThanOrEqual(50);
    expect(fulltime.resilience).toBe(54); // 100 − 30 boundaries − 16 async
    expect(fulltime.testing).toBeLessThanOrEqual(50);
    expect(contract.productionScore).toBeGreaterThanOrEqual(74);
    expect(contract.productionScore).toBeLessThanOrEqual(82);
    expect(fulltime.productionScore).toBeGreaterThanOrEqual(58);
    expect(fulltime.productionScore).toBeLessThanOrEqual(64);
    expect(fulltime.productionScore).toBeLessThan(contract.productionScore);
  });

  it("subtracts 30 from an upstream fork or template and floors at 0", () => {
    expect(applyUpstreamDerivativePenalty(92, false)).toBe(92);
    expect(applyUpstreamDerivativePenalty(92, true)).toBe(62);
    expect(applyUpstreamDerivativePenalty(20, true)).toBe(0);
    expect(applyUpstreamDerivativePenalty(0, true)).toBe(0);
  });
});
