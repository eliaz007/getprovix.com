import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runAutofixTscPreflight } from "@/lib/autofix-tsc-preflight";
import { planAutofix } from "@/lib/firewall-autofix";

describe("live split preflight on github-autofix-pr.ts", () => {
  it("typechecks the split without an unbound writes annotation", async () => {
    const filePath = "src/lib/github-autofix-pr.ts";
    const content = await readFile(path.join(process.cwd(), filePath), "utf8");
    const plan = planAutofix(filePath, content);

    expect(plan.canOpenPullRequest).toBe(true);
    expect(plan.writes.length).toBeGreaterThan(1);

    const preflight = await runAutofixTscPreflight(plan.writes);
    expect(preflight.success).toBe(true);
  }, 120_000);
});
