import { describe, expect, it } from "vitest";
import { buildIntegrityMetrics } from "@/lib/integrity-metrics";
import type { FirewallReport } from "@/lib/firewall-contract";
import type { HealingAuditEntry } from "@/lib/healing-audit";

const report: FirewallReport = {
  timestamp: "2026-10-29T18:00:00.000Z",
  architectureScore: 0,
  summary: { totalFiles: 1, totalLines: 10, criticalCount: 1, highCount: 0, mediumCount: 0, lowCount: 0 },
  largestFiles: [],
  violations: [
    {
      filePath: "src/components/jobs.tsx",
      severity: "CRITICAL",
      rule: "Client query",
      message: "Client calls supabase.from",
      line: 12,
      category: "CLIENT_DB_EXPOSURE",
      autofixable: true,
      remediation: { diff: "-supabase.from()\n+await secureQuery()" },
    },
  ],
};

const healed: HealingAuditEntry = {
  timestamp: "2026-10-29T18:04:11.000Z",
  filePath: "src/app/login/page.tsx",
  category: "leaks",
  outcome: "healed",
  ref: "#41",
};

describe("buildIntegrityMetrics", () => {
  it("scores a clean scan as optimal", () => {
    const metrics = buildIntegrityMetrics({ ...report, violations: [] }, []);
    expect(metrics.score).toBe(100);
    expect(metrics.posture).toBe("OPTIMAL");
    expect(metrics.letter).toBe("A+");
    expect(metrics.statusText).toBe("Clean scan");
    expect(metrics.boundaries.every((row) => row.status === "CLEAR" && row.open === 0)).toBe(true);
    expect(metrics.queue).toEqual([]);
  });

  it("scores the open scan and keeps fix pull requests separate", () => {
    const metrics = buildIntegrityMetrics(report, [healed]);
    expect(metrics.fixPullRequests).toBe(1);
    expect(metrics.openExposures).toBe(1);
    expect(metrics.critical).toBe(1);
    expect(metrics.score).toBe(75);
    expect(metrics.posture).toBe("DEGRADED");
    expect(metrics.letter).toBe("C");
    expect(metrics.boundaries.find((row) => row.id === "CLIENT_DB_EXPOSURE")).toMatchObject({
      open: 1,
      status: "OPEN",
    });
    expect(metrics.queue[0]).toMatchObject({
      severity: "CRITICAL",
      filePath: "src/components/jobs.tsx",
      line: 12,
      fixStatus: "FIX_READY",
    });
  });

  it("stays blank before the first scan", () => {
    const metrics = buildIntegrityMetrics(null, []);
    expect(metrics.score).toBeNull();
    expect(metrics.statusText).toBe("No scan yet");
    expect(metrics.queue).toEqual([]);
  });

  it("keeps scan score for all findings but only queues Fix with PR rows", () => {
    const metrics = buildIntegrityMetrics(
      {
        ...report,
        violations: [
          ...report.violations,
          {
            filePath: "src/lib/cycle-a.ts",
            severity: "HIGH",
            rule: "Circular Dependency",
            message: "A imports B imports A",
            line: 1,
            category: "ARCHITECTURE",
          },
          {
            filePath: "src/lib/advice-only.ts",
            severity: "CRITICAL",
            rule: "Client query",
            message: "Client calls supabase.from",
            line: 3,
            category: "CLIENT_DB_EXPOSURE",
          },
        ],
      },
      []
    );
    expect(metrics.openExposures).toBe(3);
    expect(metrics.queue).toHaveLength(1);
    expect(metrics.queue[0]?.filePath).toBe("src/components/jobs.tsx");
    expect(metrics.queue[0]?.fixStatus).toBe("FIX_READY");
  });
});