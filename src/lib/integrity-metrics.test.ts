import { describe, expect, it } from "vitest";
import {
  buildIntegrityMetrics,
  buildOverviewOpenSummary,
  computeSecurityPostureIndex,
  listOpenStructureSnapshotFindings,
  scorePostureDimension,
  securityPostureTier,
} from "@/lib/integrity-metrics";
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

describe("securityPostureTier", () => {
  it("maps enterprise bands without letter grades", () => {
    expect(securityPostureTier(100)).toMatchObject({
      tier: "VERIFIED",
      tierLabel: "Verified",
      tierAccent: "emerald",
    });
    expect(securityPostureTier(88)).toMatchObject({
      tier: "HARDENED",
      tierLabel: "Hardened",
      tierAccent: "purple",
    });
    expect(securityPostureTier(60)).toMatchObject({
      tier: "ELEVATED_RISK",
      tierLabel: "Elevated Risk",
      tierAccent: "amber",
    });
    expect(securityPostureTier(20)).toMatchObject({
      tier: "CRITICAL_EXPOSURE",
      tierLabel: "Critical Exposure",
      tierAccent: "red",
    });
  });
});

describe("scorePostureDimension", () => {
  it("applies diminishing deductions instead of collapsing to zero", () => {
    const one = scorePostureDimension([{ severity: "CRITICAL" }]);
    const three = scorePostureDimension([
      { severity: "CRITICAL" },
      { severity: "CRITICAL" },
      { severity: "HIGH" },
    ]);
    expect(one).toBe(76); // 100 - 24
    expect(three).toBeGreaterThan(40);
    expect(three).toBeLessThan(one);
  });
});

describe("computeSecurityPostureIndex", () => {
  it("returns Verified 100 on a clean scan", () => {
    const index = computeSecurityPostureIndex({ ...report, violations: [] });
    expect(index).toMatchObject({
      score: 100,
      uncappedScore: 100,
      tier: "VERIFIED",
      tierLabel: "Verified",
      capReason: null,
      projectionLine: null,
    });
    expect(index?.dimensions.every((d) => d.score === 100)).toBe(true);
  });

  it("caps at 69 when any Critical security finding is open", () => {
    const index = computeSecurityPostureIndex(report);
    expect(index).not.toBeNull();
    expect(index!.uncappedScore).toBeGreaterThan(69);
    expect(index!.score).toBe(69);
    expect(index!.capReason).toBe("Capped at 69 until 1 critical finding is resolved");
    expect(index!.projectionLine).toMatch(/raises index to 100 \(Verified\)/);
    expect(index!.tier).toBe("ELEVATED_RISK");
    expect(index!.dimensions.find((d) => d.id === "data_boundaries")?.score).toBe(76);
  });

  it("weights Auth & Secrets / Data / Architecture at 50 / 30 / 20", () => {
    const index = computeSecurityPostureIndex({
      ...report,
      violations: [
        {
          filePath: "src/lib/admin.ts",
          severity: "HIGH",
          rule: "Hardcoded Secret",
          message: "secret",
          line: 1,
          category: "SECRET_LEAK",
        },
        {
          filePath: "src/lib/cycle-a.ts",
          severity: "MEDIUM",
          rule: "Circular Dependency",
          message: "cycle",
          line: 1,
          category: "ARCHITECTURE",
        },
      ],
    });
    expect(index).not.toBeNull();
    // No Critical → no cap. Auth HIGH → 86, Data 100, Arch MEDIUM → 93
    // 86*0.5 + 100*0.3 + 93*0.2 = 43 + 30 + 18.6 = 91.6 → 92
    expect(index!.capReason).toBeNull();
    expect(index!.score).toBe(index!.uncappedScore);
    expect(index!.dimensions.map((d) => d.weight)).toEqual([0.5, 0.3, 0.2]);
    expect(index!.tier).toBe("VERIFIED");
  });
});

describe("buildIntegrityMetrics", () => {
  it("scores a clean scan as Verified without letter grades", () => {
    const metrics = buildIntegrityMetrics({ ...report, violations: [] }, []);
    expect(metrics.score).toBe(100);
    expect(metrics.tier).toBe("VERIFIED");
    expect(metrics.tierLabel).toBe("Verified");
    expect(metrics.capReason).toBeNull();
    expect(metrics.statusText).toBe("Clean scan");
    expect(metrics.boundaries.every((row) => row.status === "CLEAR" && row.open === 0)).toBe(true);
    expect(metrics.queue).toEqual([]);
  });

  it("scores the open scan with the critical cap and keeps fix pull requests separate", () => {
    const metrics = buildIntegrityMetrics(report, [healed]);
    expect(metrics.fixPullRequests).toBe(1);
    expect(metrics.openExposures).toBe(1);
    expect(metrics.critical).toBe(1);
    expect(metrics.score).toBe(69);
    expect(metrics.uncappedScore).toBeGreaterThan(69);
    expect(metrics.tier).toBe("ELEVATED_RISK");
    expect(metrics.tierLabel).toBe("Elevated Risk");
    expect(metrics.capReason).toMatch(/Capped at 69/);
    expect(metrics.projectionLine).toMatch(/raises index to/);
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
    expect(metrics.tier).toBeNull();
    expect(metrics.statusText).toBe("No scan yet");
    expect(metrics.queue).toEqual([]);
  });

  it("keeps scan score for all findings but open counts match Security (no architecture)", () => {
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
    // Architecture is Structure-only; open exposures track Security snapshot findings.
    expect(metrics.openExposures).toBe(2);
    expect(metrics.boundaries.find((row) => row.id === "CLIENT_DB_EXPOSURE")).toMatchObject({
      open: 2,
      status: "OPEN",
    });
    expect(metrics.queue).toHaveLength(1);
    expect(metrics.queue[0]?.filePath).toBe("src/components/jobs.tsx");
    expect(metrics.queue[0]?.fixStatus).toBe("FIX_READY");
    expect(metrics.score).toBe(69);
    expect(metrics.capReason).toMatch(/2 critical findings/);
  });

  it("never marks a boundary Clear while Open > 0", () => {
    const metrics = buildIntegrityMetrics(report, []);
    for (const row of metrics.boundaries) {
      if (row.open > 0) expect(row.status).toBe("OPEN");
      if (row.open === 0) expect(row.status).toBe("CLEAR");
    }
  });

  it("derives boundary severity from open findings and uses catalog max when clear", () => {
    const highOnly = buildIntegrityMetrics(
      {
        ...report,
        violations: [
          {
            filePath: "src/components/jobs.tsx",
            severity: "HIGH",
            rule: "Client query",
            message: "Client calls supabase.from",
            line: 12,
            category: "CLIENT_DB_EXPOSURE",
          },
        ],
      },
      []
    );
    const exposure = highOnly.boundaries.find((row) => row.id === "CLIENT_DB_EXPOSURE");
    expect(exposure).toMatchObject({
      open: 1,
      severity: "HIGH",
      severityIsCatalogMax: false,
      status: "OPEN",
    });
    const secrets = highOnly.boundaries.find((row) => row.id === "SECRET_LEAK");
    expect(secrets).toMatchObject({
      open: 0,
      severity: "CRITICAL",
      severityIsCatalogMax: true,
      status: "CLEAR",
    });
  });

  it("exposes total open findings as security + structure", () => {
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
        ],
      },
      []
    );
    expect(metrics.openExposures).toBe(1);
    expect(metrics.structureCount).toBe(1);
    expect(metrics.totalOpenFindings).toBe(2);
  });

  it("keeps Overview / Audits / sidebar counts on one normalized selector", () => {
    const mixed: FirewallReport = {
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
      ],
      pvimFindings: [
        {
          findingId: "p1",
          source: "pvim",
          ruleId: "m2_p1_request_controlled_owner",
          label: "ownership",
          confidence: "confirmed",
          filePath: "src/app/api/x/route.ts",
          line: 10,
          message: "Request-controlled owner",
        },
      ],
    };
    const summary = buildOverviewOpenSummary(mixed);
    expect(summary.securityCount).toBe(1);
    expect(summary.pvimCount).toBe(1);
    expect(summary.openExposures).toBe(2);
    expect(summary.critical).toBe(1);
    expect(summary.structureCount).toBe(1);
    expect(listOpenStructureSnapshotFindings(mixed)).toHaveLength(1);
    // Integrity metrics must agree with the same selector.
    const metrics = buildIntegrityMetrics(mixed, []);
    expect(metrics.critical).toBe(summary.critical);
    expect(metrics.openExposures).toBe(summary.openExposures);
  });
});
