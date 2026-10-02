import { describe, expect, it } from "vitest";
import {
  countUnhandledAsyncCalls,
  preferSourceSamplePaths,
} from "@/lib/audit-content-signals";
import {
  classifyRepoFilesystem,
  isExecutableCodeFile,
  isNoisePath,
  isSourceFile,
  isTestPath,
} from "@/lib/repo-filesystem";

describe("filesystem and content heuristics", () => {
  it("ignores vendor and demo noise while classifying source and tests", () => {
    expect(isNoisePath("node_modules/lodash/index.js")).toBe(true);
    expect(isNoisePath("examples/demo/app.ts")).toBe(true);
    expect(isSourceFile("src/lib/auth.ts")).toBe(true);
    expect(isExecutableCodeFile("src/components/ui/button.tsx")).toBe(true);
    expect(isTestPath("src/lib/auth.test.ts")).toBe(true);
    expect(isSourceFile("src/lib/auth.test.ts")).toBe(false);
  });

  it("classifies a web app file tree into scoring buckets", () => {
    const evidence = classifyRepoFilesystem(
      [
        "package.json",
        "tsconfig.json",
        "next.config.ts",
        "src/app/layout.tsx",
        "src/app/page.tsx",
        "src/app/error.tsx",
        "src/app/api/audit/route.ts",
        "src/lib/auth.ts",
        "src/lib/auth.test.ts",
        ".github/workflows/ci.yml",
        "node_modules/react/index.js",
        "docs/readme-extra.md",
      ],
      { inspected: true }
    );

    expect(evidence.inspected).toBe(true);
    expect(evidence.repo_kind).toBe("web_app");
    expect(evidence.test_paths.length).toBeGreaterThan(0);
    expect(evidence.ci_workflow_paths.length).toBeGreaterThan(0);
    expect(evidence.error_handling_paths.length).toBeGreaterThan(0);
    expect(evidence.sample_paths.some((path) => path.includes("node_modules"))).toBe(
      false
    );
  });

  it("prefers API routes for content sampling and counts unhandled async", () => {
    const sampled = preferSourceSamplePaths(
      [
        "src/components/ui/button.tsx",
        "src/app/api/audit/route.ts",
        "src/lib/client.ts",
        "src/utils/format.ts",
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

    expect(
      countUnhandledAsyncCalls(`
        export async function load() {
          try {
            return await fetch("/api");
          } catch {
            return null;
          }
        }
      `)
    ).toBe(0);
  });
});
