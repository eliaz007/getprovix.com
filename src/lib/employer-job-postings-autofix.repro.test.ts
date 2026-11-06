import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeSourceTexts } from "../../scripts/ingest-engine";
import { finalizeAutofixWrites } from "@/lib/autofix-write-validation";
import {
  isServerActionFilePath,
  mergeServerAction,
  planSecurityFix,
  resolveSecurityFixLayout,
} from "@/lib/scanner/security-suite";

const FILE = "src/components/employer/employer-job-postings.tsx";
const ACTION = "src/app/actions/secure-query.ts";

/**
 * Golden: remaining CLIENT_DB_EXPOSURE inserts in employer-job-postings must
 * pass heal + `tsc` preflight after merge with the live secure-query.ts.
 * Lines are discovered from the scanner so merges with main cannot drift them.
 */
describe("employer-job-postings CLIENT_DB_EXPOSURE autofix", () => {
  it("typechecks generated secure-query for the failing lines", async () => {
    const content = readFileSync(path.join(process.cwd(), FILE), "utf8");
    const existingAction = readFileSync(path.join(process.cwd(), ACTION), "utf8");
    const report = analyzeSourceTexts([
      { filePath: FILE, content },
      { filePath: ACTION, content: existingAction },
    ]);
    const lines = report.violations
      .filter(
        (violation) =>
          violation.category === "CLIENT_DB_EXPOSURE" &&
          violation.filePath.replace(/\\/g, "/") === FILE
      )
      .map((violation) => violation.line)
      .sort((left, right) => left - right);
    expect(lines.length, "expected remaining client inserts to fix").toBeGreaterThan(0);

    const file = { filePath: FILE, content };
    const layout = resolveSecurityFixLayout({
      clientFilePath: FILE,
      tsconfigContents: [],
    });
    for (const line of lines) {
      const plan = planSecurityFix(file, "CLIENT_DB_EXPOSURE", line, layout);
      expect(plan, `missing plan for line ${line}`).toBeTruthy();
      if (!plan) continue;
      const writes = plan.writes.map((write) => {
        if (!isServerActionFilePath(write.filePath)) {
          return { filePath: write.filePath, content: write.content };
        }
        return {
          filePath: write.filePath,
          content: mergeServerAction(existingAction, write.content),
        };
      });
      const finalized = await finalizeAutofixWrites(writes);
      expect(finalized.ok, `line ${line}: ${!finalized.ok ? finalized.message : ""}`).toBe(true);
    }
  }, 180_000);
});
