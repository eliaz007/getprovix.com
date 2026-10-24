import { describe, expect, it } from "vitest";
import {
  analyzeCiGates,
  analyzeCredentialExposure,
  analyzeRouteContracts,
  analyzeSupabaseHygiene,
  analyzeTestFileContent,
  analyzeTsconfigStrict,
  analyzeTypeScriptHygiene,
  analyzeWorkflowDepth,
  countUnhandledAsyncCalls,
  preferSupabaseSqlSamplePaths,
  preferWorkflowSamplePaths,
  selectPrimaryCiWorkflowPath,
  summarizeSampledTests,
} from "./audit-content-signals";

describe("countUnhandledAsyncCalls", () => {
  it("counts fetch and await outside try/catch", () => {
    const source = `
      export async function load() {
        const res = await fetch("/api");
        return res.json();
      }
    `;
    expect(countUnhandledAsyncCalls(source)).toBe(1);
  });

  it("does not count calls that sit inside try/catch", () => {
    const source = `
      export async function load() {
        try {
          const res = await fetch("/api");
          return res.json();
        } catch (error) {
          return null;
        }
      }
    `;
    expect(countUnhandledAsyncCalls(source)).toBe(0);
  });
});

describe("analyzeWorkflowDepth", () => {
  it("grades lint/build-only workflows", () => {
    expect(
      analyzeWorkflowDepth([
        "jobs:\n  build:\n    steps:\n      - run: npm run lint\n      - run: npm run build\n",
      ])
    ).toBe("lint_build");
  });

  it("grades workflows that execute tests", () => {
    expect(
      analyzeWorkflowDepth([
        "on: pull_request\njobs:\n  test:\n    steps:\n      - run: npm test\n",
      ])
    ).toBe("tests");
  });

  it("grades multi-stage deploy/preview workflows", () => {
    expect(
      analyzeWorkflowDepth([
        "jobs:\n  test:\n    steps:\n      - run: npm test\n  deploy:\n    environment: preview\n    steps:\n      - run: vercel deploy\n",
      ])
    ).toBe("deploy");
  });
});

describe("analyzeCiGates", () => {
  it("aggregates lint/test/build across multiple workflow files", () => {
    expect(
      analyzeCiGates([
        "jobs:\n  quality:\n    steps:\n      - run: turbo lint\n      - run: turbo build\n",
        "jobs:\n  e2e:\n    steps:\n      - run: turbo test\n",
      ])
    ).toEqual({
      hasLint: true,
      hasTests: true,
      hasBuild: true,
      hasDeploy: false,
      hasMonorepoPipeline: true,
    });
  });

  it("treats turbo lint/test/build as satisfying the matching gates", () => {
    expect(
      analyzeCiGates([
        "steps:\n  - run: turbo run lint\n  - run: turbo run test\n  - run: turbo run build\n",
      ])
    ).toMatchObject({
      hasLint: true,
      hasTests: true,
      hasBuild: true,
    });
  });
});

describe("preferWorkflowSamplePaths", () => {
  it("ranks CI-shaped workflows ahead of bot/chore automation", () => {
    const ranked = preferWorkflowSamplePaths(
      [
        ".github/workflows/apply-issue-labels-to-pr.yml",
        ".github/workflows/stale.yml",
        ".github/workflows/ci.yml",
        ".github/workflows/e2e.yml",
        ".github/workflows/lint.yml",
      ],
      3
    );
    expect(ranked).toEqual([
      ".github/workflows/ci.yml",
      ".github/workflows/e2e.yml",
      ".github/workflows/lint.yml",
    ]);
  });

  it("selects a primary CI path instead of tree-order first", () => {
    expect(
      selectPrimaryCiWorkflowPath([
        ".github/workflows/apply-issue-labels-to-pr.yml",
        ".github/workflows/test.yml",
      ])
    ).toBe(".github/workflows/test.yml");
  });
});

describe("analyzeRouteContracts", () => {
  it("treats schema.parse as validation and ignores JSON.parse casts", () => {
    expect(
      analyzeRouteContracts([
        {
          path: "src/app/api/widgets/route.ts",
          text: `export async function POST(req: Request) {
            const body = widgetSchema.parse(await req.json());
            return Response.json(body);
          }`,
        },
      ])
    ).toMatchObject({
      sampled: true,
      schemaValidated: true,
      completeContracts: true,
      unvalidatedAssertions: 0,
    });

    expect(
      analyzeRouteContracts([
        {
          path: "src/app/api/widgets/route.ts",
          text: `export async function POST(req: Request) {
            const body = JSON.parse(await req.text()) as Widget;
            return Response.json(body);
          }`,
        },
      ])
    ).toMatchObject({
      sampled: true,
      schemaValidated: false,
    });
  });
});

describe("hollow test files", () => {
  it("flags empty and tautological tests, and keeps genuine assertions", () => {
    expect(analyzeTestFileContent(`it("works", () => {})`).hollow).toBe(true);
    expect(analyzeTestFileContent(`expect(true).toBe(true);`).hollow).toBe(true);
    expect(analyzeTestFileContent(`expect(1).toBe(1);`).hollow).toBe(true);
    expect(analyzeTestFileContent(`assert.strictEqual(1, 1);`).hollow).toBe(
      true
    );

    const genuine = analyzeTestFileContent(`
      expect(true).toBe(true);
      expect(add(1, 1)).toBe(2);
    `);
    expect(genuine.hollow).toBe(false);
    expect(genuine.genuineAssertionCount).toBe(1);
  });

  it("marks a sample mostly hollow only at a 50% share", () => {
    const mixed = summarizeSampledTests([
      { path: "src/a.test.ts", text: "expect(true).toBe(true)" },
      { path: "src/b.spec.ts", text: "it('x', () => {})" },
      { path: "src/c.test.ts", text: "expect(add(1, 1)).toBe(2)" },
      { path: "src/d.test.ts", text: "expect(add(2, 2)).toBe(4)" },
      { path: "examples/e.test.ts", text: "expect(true).toBe(true)" },
    ]);
    expect(mixed.sampled).toBe(4);
    expect(mixed.hollow).toBe(2);
    expect(mixed.mostlyHollow).toBe(true);

    const mostlyReal = summarizeSampledTests([
      { path: "src/a.test.ts", text: "expect(true).toBe(true)" },
      { path: "src/b.test.ts", text: "expect(add(1, 1)).toBe(2)" },
      { path: "src/c.test.ts", text: "assert.equal(add(1, 1), 2)" },
      { path: "src/d.spec.ts", text: "expect(add(2, 2)).toBe(4)" },
    ]);
    expect(mostlyReal.hollow).toBe(1);
    expect(mostlyReal.mostlyHollow).toBe(false);
  });
});

describe("analyzeTypeScriptHygiene", () => {
  it("counts any annotations and double casts", () => {
    const report = analyzeTypeScriptHygiene([
      {
        path: "src/lib/messy.ts",
        text: `
          const a: any = 1;
          const b = value as any;
          const c = raw as unknown as Widget;
          const d: Array<any> = [];
        `,
      },
    ]);
    expect(report.sampled).toBe(true);
    expect(report.anyCount).toBeGreaterThanOrEqual(3);
    expect(report.doubleAssertCount).toBe(1);
    expect(report.abusive).toBe(true);
  });

  it("reads strict mode from tsconfig", () => {
    expect(
      analyzeTsconfigStrict(['{ "compilerOptions": { "strict": true } }'])
    ).toEqual({ sampled: true, strict: true });
    expect(
      analyzeTsconfigStrict([
        '{ "compilerOptions": { "noImplicitAny": false } }',
      ])
    ).toEqual({ sampled: true, strict: false });
  });
});

describe("analyzeCredentialExposure", () => {
  it("flags service role usage inside use client modules", () => {
    const report = analyzeCredentialExposure([
      {
        path: "src/components/db-client.tsx",
        text: `'use client';
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        `,
      },
    ]);
    expect(report.serviceRoleOnClient).toBe(true);
    expect(report.serviceRoleExposureCount).toBeGreaterThan(0);
  });

  it("flags NEXT_PUBLIC service role tokens as client exposure", () => {
    const report = analyzeCredentialExposure([
      {
        path: "src/lib/server.ts",
        text: `const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;`,
      },
    ]);
    expect(report.serviceRoleOnClient).toBe(true);
  });

  it("does not treat server-only service role references as client leaks", () => {
    const report = analyzeCredentialExposure([
      {
        path: "src/lib/admin.ts",
        text: `export const key = process.env.SUPABASE_SERVICE_ROLE_KEY;`,
      },
    ]);
    expect(report.serviceRoleOnClient).toBe(false);
    expect(report.serviceRoleExposureCount).toBeGreaterThan(0);
  });
});

describe("analyzeSupabaseHygiene", () => {
  it("detects missing RLS on table DDL", () => {
    const report = analyzeSupabaseHygiene({
      sqlFiles: [
        {
          path: "supabase/migrations/001_profiles.sql",
          text: `
            create table public.profiles (
              id uuid primary key,
              display_name text
            );
          `,
        },
      ],
      treePaths: ["supabase/migrations/001_profiles.sql"],
    });
    expect(report.surfacePresent).toBe(true);
    expect(report.sqlSampled).toBe(true);
    expect(report.tableDdlCount).toBeGreaterThan(0);
    expect(report.rlsEnabled).toBe(false);
    expect(report.policyCount).toBe(0);
  });

  it("counts RLS enable and create policy", () => {
    const report = analyzeSupabaseHygiene({
      sqlFiles: [
        {
          path: "supabase/migrations/002_rls.sql",
          text: `
            alter table public.profiles enable row level security;
            create policy "own rows" on public.profiles
              for select using (auth.uid() = id);
          `,
        },
      ],
    });
    expect(report.rlsEnabled).toBe(true);
    expect(report.policyCount).toBe(1);
  });

  it("flags unchecked supabase mutations", () => {
    const report = analyzeSupabaseHygiene({
      sourceFiles: [
        {
          path: "src/lib/save.ts",
          text: `
            import { createClient } from "@supabase/supabase-js";
            await supabase.from("profiles").insert({ name: "a" });
          `,
        },
      ],
    });
    expect(report.surfacePresent).toBe(true);
    expect(report.uncheckedMutationCount).toBeGreaterThan(0);
  });

  it("prefers supabase migration SQL paths", () => {
    expect(
      preferSupabaseSqlSamplePaths(
        [
          "docs/schema.sql",
          "supabase/migrations/001_init.sql",
          "supabase/seed.sql",
        ],
        2
      )
    ).toEqual([
      "supabase/migrations/001_init.sql",
      "supabase/seed.sql",
    ]);
  });
});
