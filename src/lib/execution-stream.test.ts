import { describe, expect, it } from "vitest";
import { buildExecutionEvents, leaksAutoHealed } from "@/lib/execution-stream";
import type { FirewallReport } from "@/lib/firewall-contract";
import type { HealingAuditEntry } from "@/lib/healing-audit";

const report: FirewallReport = {
  timestamp: "2026-10-29T18:00:00.000Z",
  architectureScore: 0,
  summary: { totalFiles: 2, totalLines: 20, criticalCount: 1, highCount: 0, mediumCount: 0, lowCount: 0 },
  largestFiles: [],
  violations: [
    {
      filePath: "src/components/jobs.tsx",
      severity: "CRITICAL",
      rule: "Client query",
      message: "Client calls supabase.from",
      line: 3,
      category: "CLIENT_DB_EXPOSURE",
      remediation: { diff: "--- a/src/components/jobs.tsx\n+++ b/src/components/jobs.tsx\n-supabase.from()\n+await secureQuery()" },
    },
  ],
};

const healed: HealingAuditEntry = {
  timestamp: "2026-10-29T18:04:11.000Z",
  filePath: "src/components/jobs.tsx",
  category: "leaks",
  outcome: "healed",
  ref: "#41",
};

describe("buildExecutionEvents", () => {
  it("orders a flagged scan finding before the later verified heal", () => {
    const events = buildExecutionEvents(report, [healed]);
    expect(events.map((event) => event.badge)).toEqual(["FLAGGED", "HEALED"]);
    expect(events[0]).toMatchObject({
      severity: "CRITICAL",
      category: "CLIENT_DB_EXPOSURE",
      filePath: "src/components/jobs.tsx",
      line: 3,
      verified: false,
    });
    expect(events[1]).toMatchObject({
      ref: "#41",
      filePath: "src/components/jobs.tsx",
      verified: true,
      summary: "Rewrote client supabase.from() query into secure server action -> auto-committed to branch",
    });
    expect(events[0]?.diff).toContain("-supabase.from()");
    expect(leaksAutoHealed([healed])).toBe(1);
  });

  it("emits a single clean row when the scan has nothing to intercept", () => {
    const events = buildExecutionEvents({ ...report, violations: [] }, []);
    expect(events).toEqual([
      expect.objectContaining({ badge: "CLEAN", summary: "0 leaks, 0 violations. Ready to merge." }),
    ]);
  });
});
