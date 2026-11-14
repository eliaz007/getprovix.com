import { describe, expect, it } from "vitest";
import {
  adaptPvimFinding,
  PVIM_LABELS,
  type PvimFindingLike,
} from "@/lib/pvim/pvim-remediation-adapter";

const PIN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function baseFinding(overrides?: Partial<PvimFindingLike>): PvimFindingLike {
  return {
    finding_id: "m1:secret:src/lib/pay.ts:1",
    source: "m1",
    family: "m1",
    label: "secret_hardcoded",
    rule_id: "secrets_stripe_live",
    confidence: "confirmed",
    path: "src/lib/pay.ts",
    start_line: 1,
    message: "Hardcoded Stripe secret",
    evidence: [{ path: "src/lib/pay.ts", line: 1, kind: "secret", detail: "sk_live_…" }],
    ...overrides,
  };
}

describe("adaptPvimFinding", () => {
  it("maps confirmed secret_hardcoded to SECRET_LEAK", () => {
    const decision = adaptPvimFinding(baseFinding(), { commitSha: PIN });
    expect(decision).toMatchObject({
      ok: true,
      category: "SECRET_LEAK",
      filePath: "src/lib/pay.ts",
      line: 1,
      commitSha: PIN,
      requiresScannerAgreement: true,
    });
  });

  it("maps confirmed client supabase_insecure_access to CLIENT_DB_EXPOSURE", () => {
    const decision = adaptPvimFinding(
      baseFinding({
        finding_id: "m1:supabase:src/components/profiles.tsx:3",
        label: "supabase_insecure_access",
        rule_id: "supabase_select_star_sensitive",
        path: "src/components/profiles.tsx",
        start_line: 3,
      }),
      {
        commitSha: PIN,
        contentAtPath: () => `"use client";\nexport async function load() { return supabase.from("profiles"); }\n`,
      }
    );
    expect(decision).toMatchObject({
      ok: true,
      category: "CLIENT_DB_EXPOSURE",
      filePath: "src/components/profiles.tsx",
      line: 3,
      commitSha: PIN,
    });
  });

  it("rejects supabase_insecure_access without use client as server_side_only", () => {
    const decision = adaptPvimFinding(
      baseFinding({
        label: "supabase_insecure_access",
        rule_id: "supabase_select_star_sensitive",
        path: "src/app/api/route.ts",
        start_line: 10,
      }),
      {
        commitSha: PIN,
        contentAtPath: () => `export async function GET() { return supabase.from("profiles"); }\n`,
      }
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("server_side_only");
      expect(decision.message).toMatch(/use client/i);
    }
  });

  it("rejects authorization_flaw and never maps it to CLIENT_DB_EXPOSURE", () => {
    const decision = adaptPvimFinding(
      baseFinding({
        source: "m2",
        family: "p1",
        label: "authorization_flaw",
        rule_id: "m2_p1_request_controlled_owner",
        path: "src/app/api/items/route.ts",
        start_line: 20,
      }),
      {
        commitSha: PIN,
        contentAtPath: () => `"use client";\n`,
      }
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("unsupported_label");
      expect(decision.message).toMatch(/authorization/i);
    }
  });

  it("rejects M2 service-role findings as server_side_only", () => {
    const decision = adaptPvimFinding(
      baseFinding({
        source: "m2",
        family: "p2",
        label: "supabase_insecure_access",
        rule_id: "m2_p2_service_role_table_access",
        path: "src/lib/admin.ts",
        start_line: 8,
      }),
      {
        commitSha: PIN,
        contentAtPath: () => `"use client";\n`,
      }
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("server_side_only");
  });

  it("rejects M2 RLS findings as server_side_only", () => {
    const decision = adaptPvimFinding(
      baseFinding({
        source: "m2",
        family: "p3",
        label: "supabase_insecure_access",
        rule_id: "m2_p3_rls_not_enabled",
        path: "src/lib/db.ts",
        start_line: 4,
      }),
      {
        commitSha: PIN,
        contentAtPath: () => `"use client";\n`,
      }
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("server_side_only");
  });

  it("rejects potential and insufficient_context findings", () => {
    for (const confidence of ["potential", "insufficient_context"] as const) {
      const decision = adaptPvimFinding(baseFinding({ confidence }), { commitSha: PIN });
      expect(decision.ok).toBe(false);
      if (!decision.ok) expect(decision.code).toBe("not_confirmed");
    }
  });

  it("rejects missing or invalid start lines", () => {
    expect(adaptPvimFinding(baseFinding({ start_line: null, evidence: [] }), { commitSha: PIN })).toMatchObject({
      ok: false,
      code: "missing_location",
    });
    expect(adaptPvimFinding(baseFinding({ start_line: 0, evidence: [] }), { commitSha: PIN })).toMatchObject({
      ok: false,
      code: "missing_location",
    });
  });

  it("rejects invalid commit SHAs", () => {
    const decision = adaptPvimFinding(baseFinding(), { commitSha: "not-a-sha" });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("invalid_commit_sha");
  });

  it("rejects unsafe paths", () => {
    for (const path of ["../secret.ts", "/etc/passwd", "C:\\Windows\\system32\\a.ts", "src/\0x.ts"] as const) {
      const decision = adaptPvimFinding(baseFinding({ path }), { commitSha: PIN });
      expect(decision.ok).toBe(false);
      if (!decision.ok) expect(decision.code).toBe("path_not_repo_relative");
    }
  });

  it("covers every PVIM Label value with an explicit decision", () => {
    const contentAtPath = (filePath: string) =>
      filePath.includes("client")
        ? `"use client";\nexport const q = supabase.from("t");\n`
        : "export const server = true;\n";

    const cases: Array<{ label: (typeof PVIM_LABELS)[number]; path: string; expectOk: boolean; code?: string }> = [
      { label: "secret_hardcoded", path: "src/lib/pay.ts", expectOk: true },
      { label: "supabase_insecure_access", path: "src/components/client.tsx", expectOk: true },
      { label: "nextjs_insecure_pattern", path: "src/app/page.tsx", expectOk: false, code: "unsupported_label" },
      { label: "authorization_flaw", path: "src/app/api/x/route.ts", expectOk: false, code: "unsupported_label" },
      { label: "unsafe_db_access", path: "src/lib/db.ts", expectOk: false, code: "unsupported_label" },
      { label: "safe", path: "src/lib/ok.ts", expectOk: false, code: "unsupported_label" },
    ];

    expect(PVIM_LABELS).toHaveLength(cases.length);

    for (const entry of cases) {
      const decision = adaptPvimFinding(
        baseFinding({
          label: entry.label,
          path: entry.path,
          source: entry.label === "authorization_flaw" ? "m2" : "m1",
          family: entry.label === "authorization_flaw" ? "p1" : "m1",
          rule_id:
            entry.label === "authorization_flaw"
              ? "m2_p1_request_controlled_owner"
              : entry.label === "supabase_insecure_access"
                ? "supabase_select_star_sensitive"
                : "secrets_stripe_live",
        }),
        { commitSha: PIN, contentAtPath }
      );
      if (entry.expectOk) {
        expect(decision.ok, entry.label).toBe(true);
        if (decision.ok) {
          expect(["SECRET_LEAK", "CLIENT_DB_EXPOSURE"]).toContain(decision.category);
        }
      } else {
        expect(decision.ok, entry.label).toBe(false);
        if (!decision.ok) expect(decision.code).toBe(entry.code);
      }
    }
  });

  it("uses evidence line when start_line is absent", () => {
    const decision = adaptPvimFinding(
      baseFinding({
        start_line: null,
        evidence: [{ path: "src/lib/pay.ts", line: 7, kind: "secret", detail: "key" }],
      }),
      { commitSha: PIN }
    );
    expect(decision.ok).toBe(true);
    if (decision.ok) expect(decision.line).toBe(7);
  });
});
