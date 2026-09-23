import { describe, expect, it } from "vitest";
import {
  analyzeWorkflowDepth,
  countUnhandledAsyncCalls,
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
