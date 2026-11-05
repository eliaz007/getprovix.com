import { describe, expect, it } from "vitest";
import { analyzeSourceTexts } from "../../scripts/ingest-engine";
import { applyHonestFixGate } from "@/lib/honest-fix-gate";
import { isActionableSecurityFinding } from "@/lib/firewall-autofix";

const covered = `"use client";
export async function load(id: string) {
  const { data, error } = await supabase.from("jobs").select("*").eq("id", id);
  return { data, error };
}
`;

const uncovered = `"use client";
export async function load(id: string) {
  return supabase.from("profiles").select("*").or(\`id.eq.\${id}\`);
}
`;

describe("applyHonestFixGate", () => {
  it("keeps uncovered Supabase shapes off the Fix with PR queue without throwing", async () => {
    const report = analyzeSourceTexts([{ filePath: "src/components/profiles.tsx", content: uncovered }]);
    const finding = report.violations.find((violation) => violation.category === "CLIENT_DB_EXPOSURE");
    expect(finding?.autofixable).toBe(false);
    const gated = await applyHonestFixGate(report.violations, [
      { filePath: "src/components/profiles.tsx", content: uncovered },
    ]);
    const row = gated.find((violation) => violation.category === "CLIENT_DB_EXPOSURE");
    expect(row?.autofixable).toBe(false);
    expect(
      isActionableSecurityFinding({
        filePath: row?.filePath ?? "src/components/profiles.tsx",
        category: row?.category,
        remediation: row?.remediation,
        autofixable: row?.autofixable,
      })
    ).toBe(false);
  });

  it("shows Fix with PR only after the same tsc preflight passes", async () => {
    const report = analyzeSourceTexts([{ filePath: "src/components/jobs.tsx", content: covered }]);
    const before = report.violations.find((violation) => violation.category === "CLIENT_DB_EXPOSURE");
    expect(before?.autofixable).toBe(false);
    const gated = await applyHonestFixGate(report.violations, [
      { filePath: "src/components/jobs.tsx", content: covered },
    ]);
    const row = gated.find((violation) => violation.category === "CLIENT_DB_EXPOSURE");
    expect(row?.autofixable).toBe(true);
    expect(
      isActionableSecurityFinding({
        filePath: row!.filePath,
        category: row?.category,
        remediation: row?.remediation,
        autofixable: row?.autofixable,
      })
    ).toBe(true);
  }, 60_000);
});
