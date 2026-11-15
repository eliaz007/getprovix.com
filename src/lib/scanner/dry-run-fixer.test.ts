import { describe, expect, it } from "vitest";
import { VULNERABLE_FIXTURES } from "@/lib/scanner/__fixtures__";
import { runAstFixtureScan } from "@/lib/scanner/ast-fixture-scan";
import {
  categoryForAstRule,
  dryRunAutofix,
  dryRunAutofixFinding,
} from "@/lib/scanner/dry-run-fixer";
import { INSECURE_AUTH_SESSION_RULE } from "@/lib/scanner/get-session-auth";
import { runSecuritySuiteScan } from "@/lib/scanner/security-suite";
import { USE_SERVER_SUPABASE_AUTH_RULE } from "@/lib/scanner/use-server-supabase-auth";

const SUPABASE_SERVER_STUB = `export async function createClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "1" } }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  };
}
`;

describe("dryRunAutofix", () => {
  it("maps known rule ids to security-suite categories and leaves use-server detect-only", () => {
    expect(categoryForAstRule(INSECURE_AUTH_SESSION_RULE)).toBe("INSECURE_AUTH_SESSION");
    expect(categoryForAstRule("Hardcoded Secret")).toBe("SECRET_LEAK");
    expect(categoryForAstRule(USE_SERVER_SUPABASE_AUTH_RULE)).toBeNull();
  });

  it("rewrites getSession → getUser in memory and passes tsc --noEmit", async () => {
    const fixture = VULNERABLE_FIXTURES.find((item) => item.id === "get-session-server-action");
    expect(fixture).toBeDefined();

    const file = { filePath: fixture!.virtualPath, content: fixture!.content };
    const hit = runAstFixtureScan([file]).find(
      (item) => item.ruleId === INSECURE_AUTH_SESSION_RULE
    );
    expect(hit).toBeDefined();

    const result = await dryRunAutofix(
      file,
      {
        filePath: hit!.filePath,
        line: hit!.line,
        ruleId: hit!.ruleId,
      },
      {
        supportingWrites: [
          { filePath: "src/utils/supabase/server.ts", content: SUPABASE_SERVER_STUB },
        ],
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const patched = result.patchedWrites.find((write) => write.filePath === file.filePath);
    expect(patched?.content).toContain("supabase.auth.getUser()");
    expect(patched?.content).not.toContain("getSession");
    expect(patched?.content).toContain("data: { user }");
    expect(result.preflight.mode === "full" || result.preflight.mode === "stubbed").toBe(true);
  }, 60_000);

  it("dry-runs a Hardcoded Secret finding without calling GitHub", async () => {
    const fixture = VULNERABLE_FIXTURES.find((item) => item.id === "hardcoded-service-role-key");
    expect(fixture).toBeDefined();

    const file = { filePath: fixture!.virtualPath, content: fixture!.content };
    const finding = runSecuritySuiteScan([file]).find(
      (item) => item.category === "SECRET_LEAK"
    );
    expect(finding).toBeDefined();

    const result = await dryRunAutofixFinding(file, finding!, { skipHeal: true });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      expect.fail(result.reason + (result.diagnostics ? `\n${result.diagnostics}` : ""));
    }

    const patched = result.patchedWrites.find((write) => write.filePath === file.filePath);
    expect(patched?.content).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(patched?.content).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.");
  }, 60_000);

  it("refuses detect-only use-server auth violations without inventing a patch", async () => {
    const fixture = VULNERABLE_FIXTURES.find((item) => item.id === "unauthenticated-db-mutation");
    expect(fixture).toBeDefined();

    const file = { filePath: fixture!.virtualPath, content: fixture!.content };
    const hit = runAstFixtureScan([file]).find(
      (item) => item.ruleId === USE_SERVER_SUPABASE_AUTH_RULE
    );
    expect(hit).toBeDefined();

    const result = await dryRunAutofix(file, {
      filePath: hit!.filePath,
      line: hit!.line,
      ruleId: hit!.ruleId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/detect-only/);
    expect(result.plan).toBeUndefined();
  });
});
