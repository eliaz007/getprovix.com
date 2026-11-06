import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { finalizeAutofixWrites } from "@/lib/autofix-write-validation";
import { agenticFixWithRetry } from "@/lib/agentic-fix-with-retry";
import { planSecurityFix, runSecuritySuiteScan } from "@/lib/scanner/security-suite";

const FILE = "src/lib/billing-key.ts";
/** Built at runtime so GitHub push protection does not flag a Stripe-shaped literal. */
const SECRET = `sk_live_${"a".repeat(24)}`;
const SOURCE = `export function charge(mode: "${SECRET}"): string {
  return mode;
}
`;

function loadGeminiKey(): void {
  const text = readFileSync(".env.local", "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*GEMINI_API_KEY\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[1] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env.GEMINI_API_KEY = value;
    return;
  }
  throw new Error("GEMINI_API_KEY missing from .env.local");
}

function redact(message: string): string {
  const key = process.env.GEMINI_API_KEY ?? "";
  return key ? message.split(key).join("[redacted]") : message;
}

describe("live agentic secret verification", () => {
  it("fixes an uncovered Stripe key after the deterministic plan fails tsc", async () => {
    loadGeminiKey();
    expect(process.env.GEMINI_API_KEY?.length ?? 0).toBeGreaterThan(10);
    process.env.PROVIX_AGENTIC_CLIENT_DB = "1";

    const finding = runSecuritySuiteScan([{ filePath: FILE, content: SOURCE }]).find(
      (item) => item.category === "SECRET_LEAK"
    );
    expect(finding).toBeTruthy();

    const plan = planSecurityFix({ filePath: FILE, content: SOURCE }, "SECRET_LEAK", finding?.line ?? 1);
    expect(plan?.writes.length ?? 0).toBeGreaterThan(0);
    const deterministic = await finalizeAutofixWrites(
      (plan?.writes ?? []).map((write) => ({ filePath: write.filePath, content: write.content }))
    );
    console.log(
      `DETERMINISTIC ok=${deterministic.ok} message=${deterministic.ok ? "" : redact(deterministic.message)}`
    );
    expect(deterministic.ok).toBe(false);

    const result = await agenticFixWithRetry({
      finding: {
        filePath: FILE,
        line: finding?.line ?? 1,
        category: "SECRET_LEAK",
        snippet: finding?.snippet,
      },
      content: SOURCE,
      existingEnvExample: null,
    });

    if (!result.ok) {
      console.log(`LIVE_RESULT ok=false attempts=${result.attempts}`);
      console.log(redact(result.message));
    } else {
      console.log(`LIVE_RESULT ok=true attempts=${result.attempts}`);
      for (const write of result.writes) {
        console.log(`--- ${write.filePath}`);
        console.log(write.content);
      }
    }

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.writes.some((write) => write.content.includes(SECRET))).toBe(false);
  }, 240_000);
});
