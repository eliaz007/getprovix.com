import { describe, expect, it } from "vitest";
import { buildHealingAuditSummary, categorizeHealingAuditRow } from "@/lib/healing-audit-summary";

describe("categorizeHealingAuditRow", () => {
  it("marks leak rows as critical", () => {
    expect(
      categorizeHealingAuditRow({
        file_path: "src/billing.tsx",
        category: "leaks",
        status: "open",
        created_at: "2026-10-29T18:00:00.000Z",
      }).tier
    ).toBe("critical");
  });

  it("marks architecture heals as warnings", () => {
    expect(
      categorizeHealingAuditRow({
        file_path: "scripts/ingest-engine.ts",
        category: "violations",
        status: "merged",
        created_at: "2026-10-29T18:00:00.000Z",
      }).tier
    ).toBe("warning");
  });

  it("escalates a reverted architecture patch to critical", () => {
    expect(
      categorizeHealingAuditRow({
        file_path: "src/lib/billing.ts",
        category: "violations",
        status: "closed",
        created_at: "2026-10-29T18:00:00.000Z",
      })
    ).toMatchObject({ tier: "critical", label: "Patch reverted" });
  });
});

describe("buildHealingAuditSummary", () => {
  it("returns CLEAR when the log is empty", () => {
    const summary = buildHealingAuditSummary([]);
    expect(summary.verdict).toBe("CLEAR");
    expect(summary.criticalCount).toBe(0);
  });

  it("returns CRITICAL when any patch was reverted", () => {
    const summary = buildHealingAuditSummary([
      {
        file_path: "a.ts",
        category: "violations",
        status: "closed",
        created_at: "2026-10-29T18:00:00.000Z",
      },
      {
        file_path: "b.ts",
        category: "violations",
        status: "open",
        created_at: "2026-10-29T19:00:00.000Z",
      },
    ]);
    expect(summary.verdict).toBe("CRITICAL");
    expect(summary.criticalCount).toBe(1);
    expect(summary.warningCount).toBe(1);
  });

  it("returns ATTENTION for healed security leaks", () => {
    const summary = buildHealingAuditSummary([
      {
        id: "1",
        file_path: "src/app/login/page.tsx",
        category: "leaks",
        status: "open",
        created_at: "2026-10-30T02:28:02.742Z",
      },
    ]);
    expect(summary.verdict).toBe("ATTENTION");
    expect(summary.headline).toContain("Security exposures");
    expect(summary.critical[0]?.filePath).toBe("src/app/login/page.tsx");
  });

  it("returns STABLE for architecture-only interventions", () => {
    const summary = buildHealingAuditSummary([
      {
        file_path: "scripts/ingest-engine.ts",
        category: "violations",
        status: "merged",
        created_at: "2026-10-29T23:12:13.705Z",
      },
    ]);
    expect(summary.verdict).toBe("STABLE");
    expect(summary.warningCount).toBe(1);
    expect(summary.criticalCount).toBe(0);
  });
});
