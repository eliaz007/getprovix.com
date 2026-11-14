import { describe, expect, it } from "vitest";
import {
  isProvixScoredViolation,
  violationCategory,
  type FirewallPvimAnalysis,
  type FirewallPvimFinding,
  type FirewallReport,
} from "@/lib/firewall-contract";
import { buildRunnerChecks, runnerStatus } from "@/lib/firewall-runner";
import { toFirewallReport } from "@/lib/github-firewall-scan";

const PIN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function baseReport(overrides: Partial<FirewallReport> = {}): FirewallReport {
  return {
    timestamp: "2026-11-07T00:00:00.000Z",
    architectureScore: 88,
    summary: {
      totalFiles: 4,
      totalLines: 200,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    },
    violations: [],
    largestFiles: [],
    ...overrides,
  };
}

const authorizationFinding: FirewallPvimFinding = {
  findingId: "m2:authz:1",
  source: "pvim",
  label: "authorization_flaw",
  ruleId: "m2_p1_request_controlled_owner",
  confidence: "confirmed",
  family: "p1",
  filePath: "src/app/api/items/route.ts",
  line: 20,
  message: "Request-controlled owner filter",
  remediation: {
    kind: "unsupported",
    code: "unsupported_label",
    reason: "Authorization findings are not autofixable in Provix today.",
  },
};

describe("FirewallReport PVIM provenance", () => {
  it("preserves an exact commit SHA from scan provenance", () => {
    const report = toFirewallReport(
      {
        timestamp: "2026-11-07T00:00:00.000Z",
        architectureScore: 90,
        summary: {
          totalFiles: 1,
          totalLines: 10,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
        },
        violations: [],
        files: [{ filePath: "src/a.ts", extension: ".ts", lineCount: 10, charCount: 40, imports: [] }],
      },
      { commitSha: PIN }
    );
    expect(report.commitSha).toBe(PIN);
    expect(report.pvim).toBeUndefined();
    expect(report.pvimFindings).toBeUndefined();
  });

  it("keeps existing reports without PVIM fields valid", () => {
    const report = baseReport();
    expect(report.commitSha).toBeUndefined();
    expect(report.pvim).toBeUndefined();
    expect(report.pvimFindings).toBeUndefined();
    const checks = buildRunnerChecks(report);
    expect(runnerStatus(checks)).toBe("PASSED");
  });

  it("accepts absent, ok, incomplete, and unavailable PVIM analysis states", () => {
    const statuses: FirewallPvimAnalysis["status"][] = [
      "absent",
      "ok",
      "incomplete",
      "unavailable",
    ];
    for (const status of statuses) {
      const report = toFirewallReport(
        {
          timestamp: "2026-11-07T00:00:00.000Z",
          architectureScore: 80,
          summary: {
            totalFiles: 1,
            totalLines: 5,
            criticalCount: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
          },
          violations: [],
          files: [{ filePath: "src/a.ts", extension: ".ts", lineCount: 5, charCount: 20, imports: [] }],
        },
        {
          commitSha: PIN,
          pvim: {
            status,
            findingCount: status === "ok" || status === "incomplete" ? 1 : 0,
            incomplete: status === "incomplete" ? 1 : 0,
            elapsedMs: 12,
            ...(status === "unavailable" ? { message: "PVIM service unreachable" } : {}),
          },
          pvimFindings: status === "ok" || status === "incomplete" ? [authorizationFinding] : [],
        }
      );
      expect(report.pvim?.status).toBe(status);
      expect(report.commitSha).toBe(PIN);
    }
  });

  it("refuses to classify PVIM authorization findings as ARCHITECTURE", () => {
    expect(isProvixScoredViolation(authorizationFinding)).toBe(false);
    expect(() =>
      violationCategory({
        source: "pvim",
        // no Provix category — must not invent ARCHITECTURE
      })
    ).toThrow(/refuses to classify PVIM findings as ARCHITECTURE/i);
  });

  it("round-trips optional pvimReasoning through toFirewallReport and omits when absent", () => {
    const without = toFirewallReport(
      {
        timestamp: "2026-11-07T00:00:00.000Z",
        architectureScore: 80,
        summary: {
          totalFiles: 1,
          totalLines: 5,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
        },
        violations: [],
        files: [{ filePath: "src/a.ts", extension: ".ts", lineCount: 5, charCount: 20, imports: [] }],
      },
      {
        commitSha: PIN,
        pvim: {
          status: "ok",
          findingCount: 1,
          incomplete: 0,
          elapsedMs: 12,
        },
        pvimFindings: [authorizationFinding],
      }
    );
    expect(without.pvimReasoning).toBeUndefined();

    const withReasoning = toFirewallReport(
      {
        timestamp: "2026-11-07T00:00:00.000Z",
        architectureScore: 80,
        summary: {
          totalFiles: 1,
          totalLines: 5,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
        },
        violations: [],
        files: [{ filePath: "src/a.ts", extension: ".ts", lineCount: 5, charCount: 20, imports: [] }],
      },
      {
        commitSha: PIN,
        pvim: {
          status: "ok",
          findingCount: 1,
          incomplete: 0,
          elapsedMs: 12,
        },
        pvimFindings: [authorizationFinding],
        pvimReasoning: {
          status: "present",
          detail: "validated_advisory",
          hasCriticalReliabilityFlags: false,
          criticalReliabilityFlags: [],
          notes: "Advisory note",
          openQuestions: ["Q1?"],
        },
      }
    );
    expect(withReasoning.pvimReasoning?.status).toBe("present");
    expect(withReasoning.pvimReasoning?.notes).toBe("Advisory note");
    expect(withReasoning.architectureScore).toBe(80);
    expect(withReasoning.violations).toEqual([]);
  });

  it("does not let PVIM-only findings change runner status or architecture score", () => {
    const clean = baseReport({ architectureScore: 91, commitSha: PIN });
    const withPvim = baseReport({
      architectureScore: 91,
      commitSha: PIN,
      pvim: {
        status: "ok",
        engineVersion: "0.1.0",
        jobId: "job-1",
        findingCount: 1,
        incomplete: 0,
        elapsedMs: 40,
      },
      pvimFindings: [authorizationFinding],
    });

    expect(withPvim.architectureScore).toBe(clean.architectureScore);
    expect(runnerStatus(buildRunnerChecks(clean))).toBe("PASSED");
    expect(runnerStatus(buildRunnerChecks(withPvim))).toBe("PASSED");
    expect(buildRunnerChecks(withPvim).find((check) => check.label === "BOUNDARY_CHECK")?.state).toBe(
      "OK"
    );
  });

  it("still fails the runner for Provix architecture violations", () => {
    const checks = buildRunnerChecks(
      baseReport({
        violations: [
          {
            filePath: "src/client.tsx",
            severity: "CRITICAL",
            rule: "Boundary Violation",
            message: "client reaches server",
            line: 3,
            // no category → ARCHITECTURE
          },
        ],
        pvimFindings: [authorizationFinding],
      })
    );
    expect(checks.find((check) => check.label === "BOUNDARY_CHECK")?.state).toBe("FAILED");
    expect(runnerStatus(checks)).toBe("FAILED");
  });

  it("ignores a mis-tagged PVIM row inside violations for runner scoring", () => {
    const checks = buildRunnerChecks(
      baseReport({
        violations: [
          {
            filePath: "src/app/api/items/route.ts",
            severity: "HIGH",
            rule: "authorization_flaw",
            message: "should not score",
            line: 20,
            source: "pvim",
          },
        ],
      })
    );
    expect(checks.every((check) => check.state === "OK")).toBe(true);
    expect(runnerStatus(checks)).toBe("PASSED");
  });
});
