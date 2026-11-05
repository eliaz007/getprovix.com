import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { finalizeAutofixWrites } from "@/lib/autofix-write-validation";
import {
  isServerActionFilePath,
  mergeServerAction,
  planSecurityFix,
  resolveSecurityFixLayout,
} from "@/lib/scanner/security-suite";

const FILE = "src/components/employer/employer-job-postings.tsx";

/**
 * Golden: the exact CLIENT_DB_EXPOSURE lines that used to fail Fix with PR
 * (TS2339 never.id, TS2345 insert string, TS18048 dbPayload) must pass
 * heal + `tsc` preflight after merge with the live secure-query.ts.
 */
describe("employer-job-postings CLIENT_DB_EXPOSURE autofix", () => {
  it("typechecks generated secure-query for the failing lines", async () => {
    const content = readFileSync(path.join(process.cwd(), FILE), "utf8");
    const existingAction = readFileSync(
      path.join(process.cwd(), "src/app/actions/secure-query.ts"),
      "utf8"
    );
    const file = { filePath: FILE, content };
    const layout = resolveSecurityFixLayout({
      clientFilePath: FILE,
      tsconfigContents: [],
    });
    const lines = [145, 344, 356, 366];
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
