import { describe, expect, it } from "vitest";
import { withLoggedFallback, withLoggedNull } from "@/lib/async-guard";
import { clampScore0to100, scoreBarWidthPercent } from "@/lib/score-scale";
import {
  findMentionedColumn,
  isSupabaseSchemaError,
  schemaErrorMentionsColumn,
} from "@/lib/supabase-schema-errors";
import {
  isDemoOrSamplePath,
  isExecutableCodeFile,
  isNoisePath,
  isSourceFile,
  isTestPath,
} from "@/lib/repo-filesystem";
import {
  countUnhandledAsyncCalls,
  preferSourceSamplePaths,
} from "@/lib/audit-content-signals";
import {
  normalizeEmail,
  buildPasswordResetRedirectUrl,
} from "@/lib/validate-email";
import { formatCurrency, calculatePlacementFee } from "@/lib/placement-revenue";

describe("shared utility helpers", () => {
  it("guards async failures with logged fallbacks", async () => {
    await expect(
      withLoggedFallback("utils-test", async () => 42, 0)
    ).resolves.toBe(42);

    await expect(
      withLoggedFallback(
        "utils-test",
        async () => {
          throw new Error("boom");
        },
        7
      )
    ).resolves.toBe(7);

    await expect(
      withLoggedNull("utils-test", async () => "ok")
    ).resolves.toBe("ok");
    await expect(
      withLoggedNull("utils-test", async () => {
        throw new Error("nope");
      })
    ).resolves.toBeNull();
  });

  it("classifies filesystem paths and schema error messages", () => {
    expect(isNoisePath("node_modules/lodash/index.js")).toBe(true);
    expect(isDemoOrSamplePath("examples/demo/app.ts")).toBe(true);
    expect(isSourceFile("src/lib/auth.ts")).toBe(true);
    expect(isExecutableCodeFile("src/app/page.tsx")).toBe(true);
    expect(isTestPath("src/lib/auth.test.ts")).toBe(true);
    expect(isSourceFile("src/lib/auth.test.ts")).toBe(false);

    expect(isSupabaseSchemaError({ code: "42P01" })).toBe(true);
    expect(
      schemaErrorMentionsColumn(
        { message: "Could not find the 'tech_stack' column of 'jobs'" },
        "tech_stack"
      )
    ).toBe(true);
    expect(
      findMentionedColumn(
        { message: "column required_skills does not exist" },
        ["tech_stack", "required_skills"]
      )
    ).toBe("required_skills");
  });

  it("normalizes scores, emails, sampling order, and placement math", () => {
    expect(clampScore0to100(150)).toBe(100);
    expect(clampScore0to100(-2)).toBe(0);
    expect(scoreBarWidthPercent(80)).toBe("80%");
    expect(normalizeEmail("  a@b.com ")).toBe("a@b.com");
    expect(buildPasswordResetRedirectUrl("https://getprovix.com")).toContain(
      "/auth/callback?next=%2Fupdate-password"
    );

    const sampled = preferSourceSamplePaths(
      [
        "src/components/ui/button.tsx",
        "src/app/api/audit/route.ts",
        "src/lib/client.ts",
      ],
      2
    );
    expect(sampled[0]).toContain("api/audit/route");
    expect(
      countUnhandledAsyncCalls(`
        export async function load() {
          return await fetch("/api");
        }
      `)
    ).toBeGreaterThan(0);

    expect(calculatePlacementFee(20_000)).toBe(2_500);
    expect(formatCurrency(2500)).toMatch(/\$/);
  });
});
