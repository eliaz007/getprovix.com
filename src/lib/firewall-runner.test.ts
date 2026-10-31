import { describe, expect, it } from "vitest";
import type { FirewallReport } from "@/lib/firewall-contract";
import { buildRunnerChecks, runnerStatus } from "@/lib/firewall-runner";

function report(overrides: Partial<FirewallReport> = {}): FirewallReport {
  return {
    timestamp: "2026-10-29T00:00:00.000Z",
    architectureScore: 42,
    summary: {
      totalFiles: 3,
      totalLines: 120,
      criticalCount: 1,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    },
    violations: [],
    largestFiles: [],
    ...overrides,
  };
}

describe("buildRunnerChecks", () => {
  it("passes every check when the tree is clean", () => {
    const checks = buildRunnerChecks(report());
    expect(checks.map((check) => check.state)).toEqual(["OK", "OK", "OK", "OK", "OK"]);
    expect(runnerStatus(checks)).toBe("PASSED");
    expect(checks.map((check) => check.label)).toEqual([
      "AST_PARSE",
      "BOUNDARY_CHECK",
      "SECRET_SCAN",
      "IMMUTABLE_CHECK",
      "DEPENDENCY_FLOOR",
    ]);
  });

  it("fails the matching check from the violation category and ignores the numeric score", () => {
    const checks = buildRunnerChecks(
      report({
        architectureScore: 99,
        violations: [
          {
            filePath: "app/checkout/page.tsx",
            severity: "CRITICAL",
            rule: "secret",
            message: "hardcoded key",
            line: 4,
            category: "SECRET_LEAK",
          },
          {
            filePath: "components/jobs.tsx",
            severity: "HIGH",
            rule: "client-db",
            message: "client query",
            line: 12,
            category: "CLIENT_DB_EXPOSURE",
          },
        ],
      })
    );

    expect(checks.find((check) => check.label === "SECRET_SCAN")).toMatchObject({
      state: "FAILED",
      detail: "app/checkout/page.tsx",
    });
    expect(checks.find((check) => check.label === "IMMUTABLE_CHECK")).toMatchObject({
      state: "FAILED",
      detail: "components/jobs.tsx",
    });
    expect(checks.find((check) => check.label === "BOUNDARY_CHECK")?.state).toBe("OK");
    expect(runnerStatus(checks)).toBe("FAILED");
  });

  it("fails the parse when no source files were accepted", () => {
    const checks = buildRunnerChecks(
      report({
        summary: {
          totalFiles: 0,
          totalLines: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
        },
      })
    );
    expect(checks[0]).toMatchObject({ label: "AST_PARSE", state: "FAILED" });
    expect(runnerStatus(checks)).toBe("FAILED");
  });
});
