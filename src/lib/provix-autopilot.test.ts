import { afterEach, describe, expect, it, vi } from "vitest";
import { agenticFixWithRetry } from "@/lib/agentic-fix-with-retry";
import { autopilotBranchName, runAutopilotFix } from "@/lib/provix-autopilot";

vi.mock("@/lib/agentic-fix-with-retry", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agentic-fix-with-retry")>(
    "@/lib/agentic-fix-with-retry"
  );
  return {
    ...actual,
    agenticFixWithRetry: vi.fn(),
    isAgenticClientDbEnabled: () => process.env.PROVIX_AGENTIC_CLIENT_DB === "1",
  };
});

describe("runAutopilotFix", () => {
  afterEach(() => {
    delete process.env.PROVIX_AGENTIC_CLIENT_DB;
    vi.mocked(agenticFixWithRetry).mockReset();
  });

  it("uses the deterministic security plan when it typechecks", async () => {
    const content = `"use client";
export async function load(id: string) {
  const { data, error } = await supabase.from("jobs").select("*").eq("id", id);
  return { data, error };
}
`;
    const result = await runAutopilotFix({
      finding: { filePath: "src/components/jobs.tsx", line: 3, category: "CLIENT_DB_EXPOSURE" },
      content,
      existingServerAction: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe("deterministic");
    expect(result.writes.some((write) => write.filePath.endsWith("secure-query.ts"))).toBe(true);
    expect(agenticFixWithRetry).not.toHaveBeenCalled();
  }, 60_000);

  it("falls back to the agent for architecture when the AST split refuses", async () => {
    process.env.PROVIX_AGENTIC_CLIENT_DB = "1";
    vi.mocked(agenticFixWithRetry).mockResolvedValue({
      ok: true,
      attempts: 1,
      writes: [
        { filePath: "src/components/job-board.tsx", content: 'export { JobBoard } from "./job-board/board";\n' },
        {
          filePath: "src/components/job-board/board.tsx",
          content: "export function JobBoard() { return null; }\n",
        },
      ],
    });
    const content = `"use client";
export function JobBoard() {
  const title = "Open roles";
  function Heading() { return title; }
  return Heading();
}
`;
    const result = await runAutopilotFix({
      finding: {
        filePath: "src/components/job-board.tsx",
        line: 1,
        category: "ARCHITECTURAL_BLOAT",
        rule: "Architectural Bloat",
      },
      content,
    });
    expect(agenticFixWithRetry).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe("agentic");
    expect(result.writes.length).toBe(2);
  });

  it("names autopilot branches under provix/auto-heal-", () => {
    expect(autopilotBranchName("secret", "src/lib/billing.ts")).toMatch(
      /^provix\/auto-heal-secret-src-lib-billing-[a-z0-9]+$/
    );
  });
});
