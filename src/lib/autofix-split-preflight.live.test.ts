import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runAutofixTscPreflight } from "@/lib/autofix-tsc-preflight";
import { planAutofix } from "@/lib/firewall-autofix";

describe("live split preflight on github-autofix-pr.ts", () => {
  it("blocks the PR #71 unbound-writes split before a pull request opens", async () => {
    const filePath = "src/lib/github-autofix-pr.ts";
    const content = await readFile(path.join(process.cwd(), filePath), "utf8");
    const plan = planAutofix(filePath, content);

    expect(plan.canOpenPullRequest).toBe(true);
    expect(plan.writes.length).toBeGreaterThan(1);

    const preflight = await runAutofixTscPreflight(plan.writes);
    expect(preflight.success).toBe(false);
    if (preflight.success) return;
    expect(preflight.message).toMatch(/tsc --noEmit/i);
    expect(preflight.diagnostics).toMatch(/Cannot find name 'writes'/i);
  }, 120_000);
});
