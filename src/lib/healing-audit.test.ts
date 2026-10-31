import { describe, expect, it } from "vitest";
import { healingAuditLabel, toHealingAuditEntry } from "@/lib/healing-audit";

describe("toHealingAuditEntry", () => {
  it("marks a security branch as a healed leak", () => {
    const entry = toHealingAuditEntry({
      file_path: "app/checkout/page.tsx",
      status: "open",
      branch: "provix/security-checkout",
      updated_at: "2026-10-29T18:04:11.000Z",
      created_at: "2026-10-29T18:00:00.000Z",
    });
    expect(entry).toMatchObject({
      timestamp: "2026-10-29T18:04:11.000Z",
      filePath: "app/checkout/page.tsx",
      category: "leaks",
      outcome: "healed",
      ref: "provix/security-checkout",
    });
    expect(entry ? healingAuditLabel(entry.outcome) : "").toBe("healed successfully");
  });

  it("marks a closed architecture pull request as a reverted violation", () => {
    const entry = toHealingAuditEntry({
      file_path: "/lib/billing.ts",
      status: "closed",
      branch: "provix/split-billing",
      updated_at: null,
      created_at: "2026-10-28T12:00:00.000Z",
    });
    expect(entry).toMatchObject({
      filePath: "lib/billing.ts",
      category: "violations",
      outcome: "reverted",
      timestamp: "2026-10-28T12:00:00.000Z",
      ref: "provix/split-billing",
    });
    expect(entry ? healingAuditLabel(entry.outcome) : "").toBe("patch reverted");
  });

  it("drops a row without a file path", () => {
    expect(
      toHealingAuditEntry({
        file_path: "",
        status: "merged",
        branch: null,
        updated_at: null,
        created_at: null,
      })
    ).toBeNull();
  });
});
