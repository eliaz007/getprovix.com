import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeSourceTexts } from "../../scripts/ingest-engine";
import { applyHonestFixGate } from "@/lib/honest-fix-gate";
import { isActionableSecurityFinding } from "@/lib/firewall-autofix";
import { agenticFixWithRetry } from "@/lib/agentic-fix-with-retry";

vi.mock("@/lib/agentic-fix-with-retry", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agentic-fix-with-retry")>(
    "@/lib/agentic-fix-with-retry"
  );
  return {
    ...actual,
    agenticFixWithRetry: vi.fn(),
  };
});

/** Built at runtime so GitHub push protection does not flag a Stripe-shaped literal. */
const FAKE_STRIPE_LIVE_KEY = `sk_live_${"a".repeat(24)}`;

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

const tangledBoard = `${Array.from({ length: 16 }, (_, index) => `import { marker${index} } from "@/lib/bloat/marker-${index}";`).join("\n")}
export function JobBoard() {
  const title = "Open roles";
  function Heading() {
    return title;
  }
  return Heading();
}
`;

describe("applyHonestFixGate", () => {
  afterEach(() => {
    delete process.env.PROVIX_AGENTIC_CLIENT_DB;
    vi.mocked(agenticFixWithRetry).mockReset();
  });

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
    expect(agenticFixWithRetry).not.toHaveBeenCalled();
  }, 60_000);

  it("with the flag off, leaves a secret the deterministic plan cannot typecheck on manual review", async () => {
    const secret = `"use client";
export function charge(mode: "${FAKE_STRIPE_LIVE_KEY}"): string {
  return mode;
}
`;
    const files = [{ filePath: "src/lib/billing-key.ts", content: secret }];
    const report = analyzeSourceTexts(files);
    const gated = await applyHonestFixGate(report.violations, files);
    const row = gated.find((violation) => violation.category === "SECRET_LEAK");
    expect(row?.autofixable).toBe(false);
    expect(agenticFixWithRetry).not.toHaveBeenCalled();
  }, 60_000);

  it("with the flag, asks the agent when a secret plan fails typecheck", async () => {
    process.env.PROVIX_AGENTIC_CLIENT_DB = "1";
    vi.mocked(agenticFixWithRetry).mockResolvedValue({ ok: true, writes: [], attempts: 2 });
    const secret = `"use client";
export function charge(mode: "${FAKE_STRIPE_LIVE_KEY}"): string {
  return mode;
}
`;
    const files = [{ filePath: "src/lib/billing-key.ts", content: secret }];
    const report = analyzeSourceTexts(files);
    const gated = await applyHonestFixGate(report.violations, files);
    const row = gated.find((violation) => violation.category === "SECRET_LEAK");
    expect(agenticFixWithRetry).toHaveBeenCalledTimes(1);
    expect(row?.autofixable).toBe(true);
  }, 60_000);

  it("with the flag off, leaves an unsplittable component on manual review", async () => {
    const files = [{ filePath: "src/components/job-board.tsx", content: tangledBoard }];
    const report = analyzeSourceTexts(files);
    const gated = await applyHonestFixGate(report.violations, files);
    const row = gated.find((violation) => violation.rule === "Architectural Bloat");
    expect(row).toBeTruthy();
    expect(row?.autofixable).toBe(false);
    expect(agenticFixWithRetry).not.toHaveBeenCalled();
  });

  it("with the flag, asks the agent when a component cannot be split", async () => {
    process.env.PROVIX_AGENTIC_CLIENT_DB = "1";
    vi.mocked(agenticFixWithRetry).mockResolvedValue({ ok: true, writes: [], attempts: 1 });
    const files = [{ filePath: "src/components/job-board.tsx", content: tangledBoard }];
    const report = analyzeSourceTexts(files);
    const gated = await applyHonestFixGate(report.violations, files);
    const row = gated.find((violation) => violation.rule === "Architectural Bloat");
    expect(agenticFixWithRetry).toHaveBeenCalledTimes(1);
    expect(row?.autofixable).toBe(true);
  });

  it("with the flag, tries the agent once and only marks a passing preflight autofixable", async () => {
    process.env.PROVIX_AGENTIC_CLIENT_DB = "1";
    vi.mocked(agenticFixWithRetry).mockResolvedValue({ ok: true, writes: [], attempts: 2 });
    const files = [
      { filePath: "src/components/a.tsx", content: uncovered },
      { filePath: "src/components/b.tsx", content: uncovered },
    ];
    const report = analyzeSourceTexts(files);
    const gated = await applyHonestFixGate(report.violations, files);
    const rows = gated.filter((violation) => violation.category === "CLIENT_DB_EXPOSURE");
    expect(agenticFixWithRetry).toHaveBeenCalledTimes(1);
    expect(rows.filter((row) => row.autofixable === true)).toHaveLength(1);
    expect(rows.filter((row) => row.autofixable !== true)).toHaveLength(1);
  });
});
