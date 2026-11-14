import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runAutofixTscPreflight } from "@/lib/autofix-tsc-preflight";
import { planAutofix } from "@/lib/firewall-autofix";

/**
 * `github-autofix-pr.ts` grew shared cross-closure helpers (pinning / PVIM verify),
 * so planAutofix correctly refuses to split it. Keep that refuse explicit, and
 * cover the original unbound-writes preflight regression on a synthetic multi-export
 * module that the planner still splits.
 */
describe("live split preflight", () => {
  it("refuses to split github-autofix-pr.ts when helpers share bindings", async () => {
    const filePath = "src/lib/github-autofix-pr.ts";
    const content = await readFile(path.join(process.cwd(), filePath), "utf8");
    const plan = planAutofix(filePath, content);

    expect(plan.canOpenPullRequest).toBe(false);
    expect(plan.writes).toEqual([]);
    expect(plan.summary).toMatch(/share bindings across closures/i);
  });

  it("typechecks a planned multi-export split without an unbound writes annotation", async () => {
    const filePath = "src/lib/demo-live-split.ts";
    // Independent top-level units: planner must emit a barrel + modules that still typecheck.
    // The openAutofixPullRequest shape mirrors the PR #71 unbound-`writes` failure class.
    const content = [
      "export type AutofixWrite = { filePath: string; content: string };",
      "",
      "export function summarizeWrites(writes: AutofixWrite[]): string[] {",
      "  return writes.map((write) => write.filePath);",
      "}",
      "",
      "export function countWrites(writes: AutofixWrite[]): number {",
      "  return writes.length;",
      "}",
      "",
      "export async function openAutofixPullRequest(writes: AutofixWrite[]) {",
      "  return {",
      "    paths: writes.map((write) => write.filePath),",
      "    count: writes.length,",
      "  };",
      "}",
      "",
    ].join("\n");

    const plan = planAutofix(filePath, content);

    expect(plan.canOpenPullRequest).toBe(true);
    expect(plan.writes.length).toBeGreaterThan(1);
    expect(plan.writes.some((write) => write.filePath === filePath)).toBe(true);
    expect(
      plan.writes.some((write) => /openautofixpullrequest\.ts$/i.test(write.filePath))
    ).toBe(true);

    const preflight = await runAutofixTscPreflight(plan.writes);
    expect(preflight.success).toBe(true);
  }, 120_000);
});
