import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agenticFixWithRetry } from "@/lib/agentic-fix-with-retry";
import { planAutofix } from "@/lib/firewall-autofix";
import { analyzeSourceTexts } from "./ingest-engine";

const FILE = "src/components/job-board.tsx";
const SOURCE = `${Array.from({ length: 16 }, (_, index) => `import { marker${index} } from "@/lib/bloat/marker-${index}";`).join("\n")}

export function JobBoard() {
  const title = "Open roles";
  function Heading() {
    return title;
  }
  function Count(open: boolean) {
    return open ? title : "closed";
  }
  const open = true;
  return Heading() + Count(open) + String(marker0) + String(marker15);
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

describe("live agentic architecture split", () => {
  it("splits a bloated component the deterministic planner leaves as one unit", async () => {
    loadGeminiKey();
    expect(process.env.GEMINI_API_KEY?.length ?? 0).toBeGreaterThan(10);
    process.env.PROVIX_AGENTIC_CLIENT_DB = "1";

    const report = analyzeSourceTexts([{ filePath: FILE, content: SOURCE }]);
    const bloat = report.violations.find((violation) => violation.rule === "Architectural Bloat");
    expect(bloat).toBeTruthy();

    const plan = planAutofix(FILE, SOURCE);
    console.log(`DETERMINISTIC canOpenPullRequest=${plan.canOpenPullRequest} summary=${plan.summary}`);
    expect(plan.canOpenPullRequest).toBe(false);

    const result = await agenticFixWithRetry({
      finding: {
        filePath: FILE,
        line: bloat?.line ?? 1,
        category: "ARCHITECTURAL_BLOAT",
        snippet: plan.summary,
      },
      content: SOURCE,
      existingServerAction: null,
      existingEnvExample: null,
    });

    if (!result.ok) {
      console.log(`LIVE_RESULT ok=false attempts=${result.attempts}`);
      console.log(redact(result.message));
    } else {
      console.log(`LIVE_RESULT ok=true attempts=${result.attempts} files=${result.writes.length}`);
      for (const write of result.writes) {
        console.log(`--- ${write.filePath}`);
        console.log(write.content);
      }
    }

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.writes.length).toBeGreaterThanOrEqual(2);
    const barrel = result.writes.find((write) => write.filePath === FILE);
    expect(barrel?.content).toMatch(/\bJobBoard\b/);
    expect(result.writes.some((write) => write.filePath.startsWith("src/components/job-board/"))).toBe(true);
  }, 240_000);
});
