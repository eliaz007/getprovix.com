import { describe, expect, it } from "vitest";
import {
  analyzeCiGates,
  analyzeWorkflowDepth,
  countUnhandledAsyncCalls,
  preferWorkflowSamplePaths,
  selectPrimaryCiWorkflowPath,
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
