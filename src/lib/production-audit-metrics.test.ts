import { describe, expect, it } from "vitest";
import {
  buildExecutiveChecklist,
  classifyCommitCadence,
  classifyRepoActivityStatus,
  scoreCommitHistoryPenalty,
  SINGLE_DUMP_CADENCE_LABEL,
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

  it("penalizes one-shot histories and leaves multi-day inactivity alone", () => {
    const stale = ["2023-01-01T00:00:00.000Z"];
    expect(scoreCommitHistoryPenalty(stale, Date.parse("2026-09-22"))).toBe(
      -25
    );
    expect(scoreCommitHistoryPenalty(null)).toBe(0);
    expect(scoreCommitHistoryPenalty([])).toBe(-25);
    expect(classifyRepoActivityStatus(stale, Date.parse("2026-09-22"))).toBe(
      "stable"
    );
    expect(
      classifyRepoActivityStatus(
        ["2026-09-20T00:00:00.000Z"],
        Date.parse("2026-09-22")
      )
    ).toBe("active");
    expect(
      scoreCommitHistoryPenalty([
        "2023-01-01T00:00:00.000Z",
        "2023-06-01T00:00:00.000Z",
      ])
    ).toBe(-20);
    expect(
      scoreCommitHistoryPenalty([
        "2026-05-02T12:00:00.000Z",
        "2026-05-02T12:40:00.000Z",
        "2026-05-02T13:10:00.000Z",
        "2026-05-02T13:50:00.000Z",
        "2026-05-02T18:30:00.000Z",
      ])
    ).toBe(-20);
    expect(
      scoreCommitHistoryPenalty([
        "2026-05-02T08:00:00.000Z",
        "2026-05-02T14:00:00.000Z",
        "2026-05-02T20:00:00.000Z",
      ])
    ).toBe(0);
    expect(
      scoreCommitHistoryPenalty([
        "2026-05-02T22:30:00.000Z",
        "2026-05-03T01:00:00.000Z",
      ])
    ).toBe(-20);
    expect(
      scoreCommitHistoryPenalty(
        [
          "2026-05-01T00:00:00.000Z",
          "2026-05-02T00:00:00.000Z",
          "2026-05-03T00:00:00.000Z",
        ],
        undefined,
        [
          {
            date: "2026-05-01T00:00:00.000Z",
            additions: 12,
            deletions: 0,
            message: "feat: all the code",
          },
          {
            date: "2026-05-02T00:00:00.000Z",
            additions: 0,
            deletions: 0,
            message: "chore: empty",
          },
          {
            date: "2026-05-03T00:00:00.000Z",
            additions: 0,
            deletions: 0,
            message: "docs",
          },
        ]
      )
    ).toBe(-20);
    expect(
      scoreCommitHistoryPenalty(
        [
          "2026-05-01T00:00:00.000Z",
          "2026-05-02T00:00:00.000Z",
          "2026-05-03T00:00:00.000Z",
        ],
        undefined,
        [
          {
            date: "2026-05-01T00:00:00.000Z",
            additions: 1800,
            deletions: 40,
            message: "Initial commit",
          },
          {
            date: "2026-05-02T00:00:00.000Z",
            additions: 2,
            deletions: 1,
            message: "typo",
          },
          {
            date: "2026-05-03T00:00:00.000Z",
            additions: 1,
            deletions: 0,
            message: "readme",
          },
        ]
      )
    ).toBe(-25);
  });

  it("wires commit history penalty into the headline production score", () => {
    const filesystem = classifyRepoFilesystem(WEB_APP_PATHS, {
      inspected: true,
    });
    const baseline = computeProductionAuditMetrics(filesystem, "fulltime");
    const penalized = computeProductionAuditMetrics(filesystem, "fulltime", {
      commitDates: ["2026-01-01T00:00:00.000Z"],
    });
    expect(penalized.commitHistoryPenalty).toBe(25);
    expect(penalized.productionScore).toBe(
      Math.max(0, baseline.productionScore - 25)
    );
  });

  it("flags stub repos on the executive checklist instead of active", () => {
    const recentStub = [
      "2026-10-20T12:00:00.000Z",
      "2026-10-20T18:00:00.000Z",
    ];
    const cadence = classifyCommitCadence(recentStub, Date.parse("2026-10-22"));
    expect(cadence.commitHistoryPenalty).toBe(20);
    expect(cadence.status).toBe(SINGLE_DUMP_CADENCE_LABEL);
    expect(cadence.tone).toBe("warn");
    expect(cadence.activity).toBe("active");

    const checklist = buildExecutiveChecklist({
      commitDates: recentStub,
      commitHistoryPenalty: 20,
    });
    const activity = checklist.find((item) => item.id === "commit_cadence");
    expect(activity?.status).toBe(SINGLE_DUMP_CADENCE_LABEL);
    expect(activity?.tone).toBe("warn");
  });

  it("caps architecture for abusive TypeScript hygiene and non-strict tsconfig", () => {
    const filesystem = {
      ...classifyRepoFilesystem(WEB_APP_PATHS, { inspected: true }),
      typescript_hygiene_sampled: true,
      ts_any_count: 4,
      ts_double_assert_count: 1,
      ts_loose_assert_count: 0,
      tsconfig_strict: false,
    };
    expect(scoreArchitecture(filesystem)).toBeLessThanOrEqual(70);
  });

  it("hard-caps resilience when service role leaks to the client", () => {
    const filesystem = {
      ...classifyRepoFilesystem(WEB_APP_PATHS, { inspected: true }),
      credential_leak_sampled: true,
      service_role_on_client: true,
      service_role_exposure_count: 1,
    };
    expect(scoreResilience(filesystem, "web_app")).toBe(25);
  });

  it("caps resilience when Supabase SQL defines tables without RLS", () => {
    const filesystem = {
      ...classifyRepoFilesystem(WEB_APP_PATHS, { inspected: true }),
      error_handling_paths: ["src/app/error.tsx"],
      supabase_hygiene_sampled: true,
      supabase_surface_present: true,
      supabase_sql_sampled: true,
      supabase_table_ddl_count: 2,
      supabase_rls_enabled: false,
      supabase_policy_count: 0,
    };
    expect(scoreResilience(filesystem, "web_app", "fulltime")).toBeLessThanOrEqual(
      55
    );
  });

  it("caps resilience when RLS is enabled without policies", () => {
    const filesystem = {
      ...classifyRepoFilesystem(WEB_APP_PATHS, { inspected: true }),
      error_handling_paths: ["src/app/error.tsx"],
      supabase_hygiene_sampled: true,
      supabase_surface_present: true,
      supabase_sql_sampled: true,
      supabase_table_ddl_count: 1,
      supabase_rls_enabled: true,
      supabase_policy_count: 0,
    };
    expect(scoreResilience(filesystem, "web_app", "fulltime")).toBeLessThanOrEqual(
      60
    );
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

  it("caps architecture at 72 when sampled routes lack schema validation", () => {
    const filesystem = classifyRepoFilesystem(WEB_APP_PATHS, {
      inspected: true,
    });
    expect(scoreArchitecture(filesystem)).toBeGreaterThan(72);
    expect(
      scoreArchitecture({
        ...filesystem,
        route_contracts_sampled: true,
        route_schema_validation: false,
        unvalidated_type_assertions: 3,
        has_contract_boundaries: false,
      })
    ).toBeLessThanOrEqual(72);
    expect(
      scoreArchitecture({
        ...filesystem,
        route_contracts_sampled: true,
        route_schema_validation: true,
        unvalidated_type_assertions: 2,
        has_contract_boundaries: false,
      })
    ).toBeGreaterThan(72);
  });

  it("caps testing at 35 when at least half of sampled tests are hollow", () => {
    const filesystem = classifyRepoFilesystem(WEB_APP_PATHS, {
      inspected: true,
    });
    const dense = {
      ...filesystem,
      unit_test_file_count: 8,
      source_file_count: 20,
      executable_source_count: 20,
      has_e2e_tools: true,
    };
    expect(scoreTesting(dense)).toBeGreaterThan(35);
    expect(
      scoreTesting({
        ...dense,
        sampled_test_file_count: 4,
        hollow_test_file_count: 1,
      })
    ).toBe(scoreTesting(dense));
    expect(
      scoreTesting({
        ...dense,
        sampled_test_file_count: 4,
        hollow_test_file_count: 2,
      })
    ).toBe(35);
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

  it("scores Full-Time testing on volume bands instead of raw density", () => {
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
    // 5 suites → top of the 1–5 band (35), not a density-crushed ~31.
    expect(scoreTesting(sparse, "fulltime")).toBe(35);

    const midVolume = {
      ...filesystem,
      unit_test_file_count: 15,
      executable_source_count: 200,
      has_e2e_tools: false,
    };
    expect(scoreTesting(midVolume, "fulltime")).toBeGreaterThanOrEqual(35);
    expect(scoreTesting(midVolume, "fulltime")).toBeLessThanOrEqual(48);

    // 32 / 285 ≈ 11% density used to score ~22; volume floor rewards the suite.
    const largeApp = {
      ...filesystem,
      unit_test_file_count: 32,
      executable_source_count: 285,
      has_e2e_tools: false,
      route_schema_validation: true,
      has_contract_boundaries: true,
    };
    expect(scoreTesting(largeApp, "fulltime")).toBeGreaterThanOrEqual(50);
    expect(scoreTesting(largeApp, "fulltime")).toBeGreaterThanOrEqual(48);
    expect(scoreTesting(largeApp, "fulltime")).toBeLessThanOrEqual(90);
  });

  it("scores thin-test web apps higher on Contract than Full-Time volume bands", () => {
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
    expect(fulltime.testing).toBe(35);
    expect(contract.productionScore).toBeGreaterThanOrEqual(74);
    expect(contract.productionScore).toBeLessThanOrEqual(82);
    expect(fulltime.productionScore).toBeGreaterThanOrEqual(58);
    expect(fulltime.productionScore).toBeLessThanOrEqual(70);
    expect(fulltime.productionScore).toBeLessThan(contract.productionScore);
  });

  it("subtracts 30 from an upstream fork or template and floors at 0", () => {
    expect(applyUpstreamDerivativePenalty(92, false)).toBe(92);
    expect(applyUpstreamDerivativePenalty(92, true)).toBe(62);
    expect(applyUpstreamDerivativePenalty(20, true)).toBe(0);
    expect(applyUpstreamDerivativePenalty(0, true)).toBe(0);
  });
});
