import { describe, expect, it } from "vitest";
import { analyzeSourceTexts } from "../../../scripts/ingest-engine";
import {
  bundleInternalAliasWrites,
  collectUnresolvedAtAliasSpecifiers,
  loadHostTsconfigPaths,
  runAutofixTscPreflight,
} from "@/lib/autofix-tsc-preflight";
import {
  detectAtAliasRoot,
  ensureSecureQueryNamedImport,
  fingerprintSecurityQuery,
  inlineSelectStringLiterals,
  isServerActionFilePath,
  mergeEnvExample,
  mergeServerAction,
  pickNextSecurityFindingForBatch,
  planSecurityFix,
  relocateSecurityFixTarget,
  resolveSecurityFixLayout,
  runSecuritySuiteScan,
  sanitizeGeneratedTypeScript,
  sortFindingsForBatchApply,
} from "@/lib/scanner/security-suite";
import ts from "typescript";

const stripe = `sk_live_${"b".repeat(24)}`;
const jwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${"a".repeat(12)}.${"c".repeat(12)}`;

describe("runSecuritySuiteScan", () => {
  it("redacts a live Stripe key and points the diff at process.env", () => {
    const findings = runSecuritySuiteScan([
      { filePath: "src/lib/pay.ts", content: `export const key = "${stripe}";\n` },
    ]);
    const finding = findings.find((item) => item.category === "SECRET_LEAK");
    expect(finding?.severity).toBe("CRITICAL");
    expect(finding?.line).toBe(1);
    expect(finding?.snippet).not.toContain(stripe);
    expect(finding?.snippet).toContain("sk_live_...");
    expect(finding?.remediation.diff).toContain("process.env.STRIPE_SECRET_KEY");
    expect(finding?.remediation.diff).not.toContain(stripe);
    expect(finding?.remediation.envExample).toBe("STRIPE_SECRET_KEY=");
  });

  it("ignores secrets in comments, node_modules, and blank env values after the patch preview", () => {
    const findings = runSecuritySuiteScan([
      { filePath: "src/lib/note.ts", content: `// ${stripe}\nexport const ok = 1;\n` },
      { filePath: "node_modules/pkg/index.ts", content: `export const key = "${stripe}";\n` },
      { filePath: ".env.local", content: `STRIPE_SECRET_KEY=${stripe}\n` },
    ]);
    expect(findings.filter((item) => item.filePath.endsWith("note.ts"))).toEqual([]);
    expect(findings.filter((item) => item.filePath.includes("node_modules"))).toEqual([]);
    const env = findings.find((item) => item.filePath === ".env.local");
    expect(env?.category).toBe("SECRET_LEAK");
    expect(env?.remediation.diff).toContain("+STRIPE_SECRET_KEY=");
    expect(env?.remediation.diff).not.toContain(stripe);
  });

  it("flags a Supabase JWT and a client database call", () => {
    const findings = runSecuritySuiteScan([
      { filePath: "src/lib/admin.ts", content: `export const token = "${jwt}";\n` },
      {
        filePath: "src/components/jobs.tsx",
        content: `"use client";\nexport async function load() {\n  return supabase.from("jobs").select("*");\n}\n`,
      },
      {
        filePath: "src/app/actions/jobs.ts",
        content: `export async function load() {\n  return supabase.from("jobs").select("*");\n}\n`,
      },
    ]);
    expect(findings.some((item) => item.message.includes("Supabase service-role JWT"))).toBe(true);
    const client = findings.find((item) => item.category === "CLIENT_DB_EXPOSURE");
    expect(client?.severity).toBe("HIGH");
    expect(client?.filePath).toBe("src/components/jobs.tsx");
    expect(client?.remediation.diff).toContain('"use server";');
    expect(client?.remediation.diff).toContain("supabase.auth.getUser()");
    expect(client?.remediation.diff).toContain("src/app/actions/secure-query.ts");
    expect(client?.remediation.diff).toContain('from "@/app/actions/secure-query"');
    expect(findings.some((item) => item.filePath === "src/app/actions/jobs.ts" && item.category === "CLIENT_DB_EXPOSURE")).toBe(
      false
    );
  });

  it("flags outdated packages and skips patched versions", () => {
    const manifest = {
      dependencies: {
        next: "14.2.0",
        jsonwebtoken: "^8.5.1",
        axios: "1.6.0",
        lodash: "4.17.21",
        moment: "2.30.1",
      },
    };
    const findings = runSecuritySuiteScan([
      { filePath: "package.json", content: `${JSON.stringify(manifest, null, 2)}\n` },
      { filePath: "src/lib/dates.ts", content: `import moment from "moment";\nexport const m = moment;\n` },
    ]);
    const names = findings.map((item) => item.message);
    expect(names.some((message) => message.includes("middleware authorization bypass"))).toBe(true);
    const jwtPackage = findings.find((item) => item.snippet.includes("jsonwebtoken"));
    expect(jwtPackage?.severity).toBe("HIGH");
    expect(jwtPackage?.remediation.command).toBe("npm install jsonwebtoken@9.0.0");
    expect(jwtPackage?.remediation.diff).toContain("^9.0.0");
    expect(findings.some((item) => item.snippet.includes("axios"))).toBe(false);
    expect(findings.some((item) => item.snippet.includes('"lodash"'))).toBe(false);
    expect(findings.some((item) => item.message.includes("moment is a deprecated"))).toBe(true);
    expect(findings.some((item) => item.message.includes("Full-library import of moment"))).toBe(true);
  });

  it("does not flag moment imports that only appear inside test fixture strings", () => {
    const findings = runSecuritySuiteScan([
      {
        filePath: "src/lib/scanner/security-suite.test.ts",
        content: [
          'import { describe, it, expect } from "vitest";',
          'const fixture = { filePath: "src/lib/dates.ts", content: `import moment from "moment";\\nexport const m = moment;\\n` };',
          "describe(\"fixture\", () => { it(\"ok\", () => expect(fixture).toBeTruthy()); });",
          "",
        ].join("\n"),
      },
    ]);
    expect(findings.some((item) => item.message.includes("Full-library import of moment"))).toBe(false);
  });

  it("merges security findings into the repository scan", () => {
    const report = analyzeSourceTexts(
      [{ filePath: "src/lib/pay.ts", content: `export const key = "${stripe}";\n` }],
      {
        includeOrphans: false,
        companionFiles: [
          {
            filePath: "package.json",
            content: `${JSON.stringify({ dependencies: { axios: "1.5.0" } }, null, 2)}\n`,
          },
        ],
      }
    );
    expect(report.violations.some((violation) => violation.category === "SECRET_LEAK")).toBe(true);
    expect(report.violations.some((violation) => violation.category === "VULNERABLE_DEPENDENCY")).toBe(true);
    expect(report.summary.criticalCount).toBeGreaterThan(0);
    const axios = report.violations.find((violation) => violation.snippet?.includes("axios"));
    expect(axios?.remediation?.command).toBe("npm update axios");
  });

  it("resolves server-action layout from tsconfig @/* aliases", () => {
    expect(detectAtAliasRoot('{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }')).toBe("src");
    expect(detectAtAliasRoot('{ "compilerOptions": { "paths": { "@/*": ["./*"] } } }')).toBe("root");
    expect(detectAtAliasRoot('{ "compilerOptions": { "baseUrl": "./src" } }')).toBe("src");
    expect(
      resolveSecurityFixLayout({
        clientFilePath: "app/login/page.tsx",
        tsconfigContents: ['{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }'],
      }).serverActionPath
    ).toBe("src/app/actions/secure-query.ts");
    expect(
      resolveSecurityFixLayout({
        clientFilePath: "src/app/login/page.tsx",
        tsconfigContents: ['{ "compilerOptions": { "paths": { "@/*": ["./*"] } } }'],
      }).serverActionPath
    ).toBe("app/actions/secure-query.ts");
    expect(
      resolveSecurityFixLayout({
        clientFilePath: "src/components/jobs.tsx",
        tsconfigContents: [],
      }).serverActionPath
    ).toBe("src/app/actions/secure-query.ts");
  });

  it("builds a two-file commit for a client query and a redacted secret", () => {
    const client = `"use client";\nexport async function load() {\n  return supabase.from("jobs").select("*");\n}\n`;
    const clientPlan = planSecurityFix(
      { filePath: "src/components/jobs.tsx", content: client },
      "CLIENT_DB_EXPOSURE",
      3
    );
    expect(clientPlan?.writes.map((write) => write.filePath)).toEqual([
      "src/components/jobs.tsx",
      "src/app/actions/secure-query.ts",
      "src/utils/supabase/server.ts",
    ]);
    expect(clientPlan?.writes[0]?.content).toContain('from "@/app/actions/secure-query"');
    expect(clientPlan?.writes[0]?.content).toContain("await secureQuery3()");
    expect(clientPlan?.writes[0]?.content).not.toContain('supabase.from("jobs")');
    expect(clientPlan?.writes[0]?.content).not.toMatch(/secureQuery3\(\)\s*\./);
    expect(clientPlan?.writes[1]?.content).toContain('"use server";');
    expect(clientPlan?.writes[1]?.content).toContain("supabase.auth.getUser()");
    expect(clientPlan?.writes[1]?.content).toContain('const { data, error } = await supabase.from("jobs").select("*");');
    expect(clientPlan?.writes[1]?.content).toContain("return { data, error };");
    expect(clientPlan?.writes[1]?.content).toContain("try {");
    expect(clientPlan?.writes[1]?.content).toContain("} catch (error) {");
    expect(clientPlan?.writes[1]?.content).toContain("data: null");
    expect(clientPlan?.writes[1]?.content).not.toContain('ok: false');
    expect(clientPlan?.writes[1]?.content).not.toMatch(/Promise<\s*\{\s*data:\s*unknown/);
    expect(clientPlan?.writes[1]?.content).not.toMatch(/\bany\b/);
    expect(clientPlan?.writes[1]?.content).toContain('from "@/utils/supabase/server"');
    expect(clientPlan?.writes[2]?.content).toContain("export async function createClient()");
    expect(clientPlan?.writes[2]?.content).toContain("@supabase/ssr");

    const selectVar = `"use client";
export async function load(userId: string) {
  const profileSelect = "role, is_verified, full_name";
  const { data, error } = await supabase.from("profiles").select(profileSelect).eq("id", userId).maybeSingle();
  return { data, error };
}
`;
    expect(
      inlineSelectStringLiterals(
        'supabase.from("profiles").select(profileSelect).eq("id", userId)',
        selectVar
      )
    ).toContain('.select("role, is_verified, full_name")');
    const selectVarPlan = planSecurityFix(
      { filePath: "src/components/profile.tsx", content: selectVar },
      "CLIENT_DB_EXPOSURE",
      4
    );
    const action = selectVarPlan?.writes.find((write) => write.filePath.endsWith("secure-query.ts"))?.content ?? "";
    expect(action).toContain('.select("role, is_verified, full_name")');
    expect(action).not.toContain("profileSelect");
    expect(action).not.toMatch(/secureQuery\d+\(\s*profileSelect/);
    expect(selectVarPlan?.writes[0]?.content).toMatch(/secureQuery\d+\(/);
    expect(selectVarPlan?.writes[0]?.content).not.toContain("select(profileSelect)");

    const withSwr = `"use client";\nimport useSWR from "swr";\nexport function Box() {\n  return useSWR("jobs", async () => supabase.from("jobs").select("*"));\n}\n`;
    const swrPlan = planSecurityFix(
      { filePath: "src/components/jobs.tsx", content: withSwr },
      "CLIENT_DB_EXPOSURE",
      4
    );
    expect(swrPlan?.writes[0]?.content).toContain('import useSWR from "swr"');
    expect(swrPlan?.writes[0]?.content).toContain('import { secureQuery4 } from "@/app/actions/secure-query"');
    expect(swrPlan?.writes[0]?.content).toContain("await secureQuery4()");

    const chained = `"use client";\nexport async function load(userId: string) {\n  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();\n  return { data, error };\n}\n`;
    const chainedPlan = planSecurityFix(
      { filePath: "src/app/login/page.tsx", content: chained },
      "CLIENT_DB_EXPOSURE",
      3
    );
    expect(chainedPlan?.writes[0]?.content).toContain("await secureQuery3(userId)");
    expect(chainedPlan?.writes[0]?.content).not.toContain("secureQuery3(userId).select");
    expect(chainedPlan?.writes[0]?.content).not.toContain('supabase.from("profiles")');
    expect(chainedPlan?.writes[1]?.content).toContain(
      'const { data, error } = await supabase.from("profiles").select("*").eq("id", userId == null ? undefined : String(userId)).single();'
    );
    expect(chainedPlan?.writes[1]?.content).toContain("userId: string | undefined");
    expect(chainedPlan?.writes[1]?.content).toContain("return { data, error };");

    const objectId = `"use client";\nexport async function load(profile: { id: string }) {\n  const { data, error } = await supabase.from("profiles").select("*").eq("id", profile.id).maybeSingle();\n  return { data, error };\n}\n`;
    const objectPlan = planSecurityFix(
      { filePath: "src/components/dashboard/dashboard-nav-context.tsx", content: objectId },
      "CLIENT_DB_EXPOSURE",
      3
    );
    expect(objectPlan?.writes[0]?.content).toContain("await secureQuery3(profile)");
    expect(objectPlan?.writes[1]?.content).toContain("profile: { id: string } | undefined");
    expect(objectPlan?.writes[1]?.content).toContain(
      'eq("id", profile?.id == null ? undefined : String(profile.id))'
    );
    expect(objectPlan?.writes[1]?.content).not.toContain("String(profile).id");
    expect(objectPlan?.writes[1]?.content).not.toMatch(/profile:\s*string\s*\|\s*undefined/);

    const inFilter = `"use client";\nexport async function load(ids: string[]) {\n  const { data, error } = await supabase.from("profiles").select("*").in("id", ids);\n  return { data, error };\n}\n`;
    const inPlan = planSecurityFix(
      { filePath: "src/components/dashboard/dashboard-nav-context.tsx", content: inFilter },
      "CLIENT_DB_EXPOSURE",
      3
    );
    expect(inPlan?.writes[1]?.content).toContain("ids: readonly string[] | undefined");
    expect(inPlan?.writes[1]?.content).toContain('.in("id", ids ?? [])');

    const boolAndNumber = `"use client";\nexport async function load(isActive: boolean) {\n  const { data, error } = await supabase.from("jobs").select("*").eq("active", true).eq("priority", 1).eq("is_active", isActive);\n  return { data, error };\n}\n`;
    const boolPlan = planSecurityFix(
      { filePath: "src/components/jobs.tsx", content: boolAndNumber },
      "CLIENT_DB_EXPOSURE",
      3
    );
    expect(boolPlan?.writes[1]?.content).toContain('.is("active", true)');
    expect(boolPlan?.writes[1]?.content).toContain('.eq("priority", String(1))');
    expect(boolPlan?.writes[1]?.content).toContain("isActive: boolean | null | undefined");
    expect(boolPlan?.writes[1]?.content).toContain('.is("is_active", isActive ?? null)');
    expect(boolPlan?.writes[1]?.content).not.toContain('.eq("active", true)');
    expect(boolPlan?.writes[1]?.content).toContain(
      'error: { message: "Unauthorized", details: "", hint: "", code: "401" }'
    );

    const nullFilter = `"use client";\nexport async function load() {\n  const { data, error } = await supabase.from("jobs").select("*").eq("deleted_at", null);\n  return { data, error };\n}\n`;
    const nullPlan = planSecurityFix(
      { filePath: "src/components/jobs.tsx", content: nullFilter },
      "CLIENT_DB_EXPOSURE",
      3
    );
    expect(nullPlan?.writes[1]?.content).toContain('.is("deleted_at", null)');
    expect(nullPlan?.writes[1]?.content).not.toContain('.eq("deleted_at", null)');

    const authUser = `"use client";\nexport async function load(user: { id: string }) {\n  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();\n  return { data, error };\n}\n`;
    const authPlan = planSecurityFix(
      { filePath: "src/app/login/page.tsx", content: authUser },
      "CLIENT_DB_EXPOSURE",
      3
    );
    expect(authPlan?.writes[0]?.content).toContain("await secureQuery3()");
    expect(authPlan?.writes[0]?.content).not.toContain("secureQuery3(user)");
    expect(authPlan?.writes[1]?.content).toContain("export async function secureQuery3()");
    expect(authPlan?.writes[1]?.content).not.toMatch(/secureQuery3\(\s*user\s*:/);
    expect(authPlan?.writes[1]?.content).toContain("user.id");

    const rootClient = planSecurityFix(
      {
        filePath: "app/login/page.tsx",
        content: `"use client";\nexport async function load() {\n  return supabase.from("jobs").select("*");\n}\n`,
      },
      "CLIENT_DB_EXPOSURE",
      3,
      resolveSecurityFixLayout({
        clientFilePath: "app/login/page.tsx",
        tsconfigContents: ['{ "compilerOptions": { "paths": { "@/*": ["./*"] } } }'],
      })
    );
    expect(rootClient?.writes.map((write) => write.filePath)).toEqual([
      "app/login/page.tsx",
      "app/actions/secure-query.ts",
      "utils/supabase/server.ts",
    ]);
    expect(rootClient?.writes[0]?.content).toContain('from "@/app/actions/secure-query"');
    expect(rootClient?.writes[2]?.content).toContain("export async function createClient()");

    const srcAliasOnRootFile = planSecurityFix(
      {
        filePath: "components/jobs.tsx",
        content: `"use client";\nexport async function load() {\n  return supabase.from("jobs").select("*");\n}\n`,
      },
      "CLIENT_DB_EXPOSURE",
      3,
      resolveSecurityFixLayout({
        clientFilePath: "components/jobs.tsx",
        tsconfigContents: ['{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }'],
      })
    );
    expect(srcAliasOnRootFile?.writes.map((write) => write.filePath)).toEqual([
      "components/jobs.tsx",
      "src/app/actions/secure-query.ts",
      "src/utils/supabase/server.ts",
    ]);
    expect(srcAliasOnRootFile?.writes[0]?.content).toContain('from "@/app/actions/secure-query"');
    expect(srcAliasOnRootFile?.writes[2]?.content).toContain("export async function createClient()");

    const secretPlan = planSecurityFix(
      { filePath: "src/lib/pay.ts", content: `export const key = "${stripe}";\n` },
      "SECRET_LEAK",
      1
    );
    expect(secretPlan?.writes[0]?.content).toContain("process.env.STRIPE_SECRET_KEY");
    expect(secretPlan?.writes[0]?.content).not.toContain(stripe);
    expect(secretPlan?.writes[1]?.appendLine).toBe("STRIPE_SECRET_KEY=");
    expect(mergeEnvExample("NEXT_PUBLIC_APP_URL=\n", "STRIPE_SECRET_KEY=")).toBe(
      "NEXT_PUBLIC_APP_URL=\nSTRIPE_SECRET_KEY=\n"
    );
    const merged = mergeServerAction(clientPlan?.writes[1]?.content ?? null, 'export async function secureQuery9() {\n  return 1;\n}\n');
    expect(merged).toContain("function secureQuery3");
    expect(merged).toContain("function secureQuery9");
  });
});

describe("ensureSecureQueryNamedImport + multiline client queries", () => {
  function parseOk(filePath: string, content: string) {
    const kind = filePath.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, kind);
    const diagnostics =
      (sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ??
      [];
    return diagnostics.map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, "\n"));
  }

  it("inserts after a multiline import { ... } block, not inside it", () => {
    const source = `"use client";
import {
  useState,
  useEffect,
} from "react";
import useSWR from "swr";

export function Box() {
  return null;
}
`;
    const next = ensureSecureQueryNamedImport(source, "secureQuery12");
    // After the whole import section (multiline react + useSWR), not inside `import {`.
    expect(next).toContain(
      `import useSWR from "swr";\nimport { secureQuery12 } from "@/app/actions/secure-query";`
    );
    expect(next).toMatch(/\} from "react";\nimport useSWR from "swr";/);
    expect(next).not.toMatch(/import \{\nimport \{ secureQuery12 \}/);
    expect(parseOk("box.tsx", next)).toEqual([]);
  });

  it("does not treat .order(..., { ascending }) object keys as query params", () => {
    const content = `"use client";
export async function load(userId: string) {
  return supabase.from("repo_verifications").select("repo_url").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
}
`;
    const plan = planSecurityFix(
      { filePath: "src/components/dashboard/score-trend-chart.tsx", content },
      "CLIENT_DB_EXPOSURE",
      3
    );
    expect(plan).not.toBeNull();
    expect(plan?.writes[0]?.content).toContain("await secureQuery3(userId)");
    expect(plan?.writes[0]?.content).not.toMatch(/secureQuery3\([^)]*ascending/);
    expect(plan?.writes[1]?.content).toContain('order("created_at", { ascending: false })');
    expect(plan?.writes[1]?.content).toMatch(
      /export async function secureQuery3\(\s*userId:\s*string\s*\|\s*undefined\s*\)/
    );
    expect(plan?.writes[1]?.content).not.toMatch(
      /export async function secureQuery3\([^)]*ascending/
    );
    expect(plan?.writes[1]?.content).not.toMatch(/Promise<\s*\{\s*data:\s*unknown/);
    expect(plan?.writes[1]?.content).not.toMatch(/\bany\b/);
    expect(plan?.writes[1]?.content).toContain("return { data, error };");
  });

  it("sorts multi-finding batch apply by descending line within each file", () => {
    const ordered = sortFindingsForBatchApply([
      { filePath: "src/components/dashboard/dashboard-nav-context.tsx", line: 419, category: "CLIENT_DB_EXPOSURE" },
      { filePath: "src/components/dashboard/dashboard-nav-context.tsx", line: 447, category: "CLIENT_DB_EXPOSURE" },
      { filePath: "src/components/dashboard/dashboard-nav-context.tsx", line: 430, category: "CLIENT_DB_EXPOSURE" },
      { filePath: "src/components/dashboard/dashboard-nav-context.tsx", line: 440, category: "CLIENT_DB_EXPOSURE" },
      { filePath: "src/lib/pay.ts", line: 1, category: "SECRET_LEAK" },
    ]);
    expect(ordered.map((item) => `${item.category}:${item.line}`)).toEqual([
      "CLIENT_DB_EXPOSURE:447",
      "CLIENT_DB_EXPOSURE:440",
      "CLIENT_DB_EXPOSURE:430",
      "CLIENT_DB_EXPOSURE:419",
      "SECRET_LEAK:1",
    ]);

    const filePath = "src/components/dashboard/dashboard-nav-context.tsx";
    // Fixture (repo file is now a barrel re-export without client DB queries).
    const pad = Array.from({ length: 416 }, () => "// pad").join("\n");
    const content = `"use client";
${pad}
export async function loadA(userId: string) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId);
  return { data, error };
}
export async function loadB(userId: string) {
  const { data, error } = await supabase.from("profiles").select("role").eq("id", userId);
  return { data, error };
}
export async function loadC(userId: string) {
  const { data, error } = await supabase.from("jobs").select("*").eq("owner", userId);
  return { data, error };
}
export async function loadD(userId: string) {
  const { data, error } = await supabase.from("jobs").select("id").eq("owner", userId);
  return { data, error };
}
`;
    const next = pickNextSecurityFindingForBatch({ filePath, content });
    expect(next?.category).toBe("CLIENT_DB_EXPOSURE");
    expect(next?.line).toBeGreaterThanOrEqual(419);
  });

  it("accepts any line inside a multiline supabase query span", () => {
    const filePath = "src/components/dashboard/dashboard-nav-context.tsx";
    const content = `"use client";
export async function load(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return { data, error };
}
`;
    // Lines: 1="use client", 2=fn, 3=await supabase, 4=.from, 5=.select, 6=.eq, 7=.maybeSingle
    for (const line of [3, 4, 5, 6, 7]) {
      const relocated = relocateSecurityFixTarget(
        { filePath, content },
        "CLIENT_DB_EXPOSURE",
        line
      );
      expect(relocated?.line).toBe(3);
      expect(["exact", "span"]).toContain(relocated?.reason);

      const plan = planSecurityFix({ filePath, content }, "CLIENT_DB_EXPOSURE", line);
      expect(plan, `expected plan for span line ${line}`).not.toBeNull();
      expect(plan?.writes[0]?.content).toContain("await secureQuery3(");
      expect(plan?.writes[0]?.content).not.toContain('supabase\n    .from("profiles")');
      expect(plan?.writes[1]?.content).toContain("export async function secureQuery3(");
    }
    // Outside the span: nearest remaining leak still plans (line drift after prior patches).
    const outside = relocateSecurityFixTarget({ filePath, content }, "CLIENT_DB_EXPOSURE", 2);
    expect(outside).toEqual({ line: 3, reason: "nearest" });
    expect(planSecurityFix({ filePath, content }, "CLIENT_DB_EXPOSURE", 2)).not.toBeNull();
  });

  it("plans dashboard-nav-context.tsx findings including every line in each query span", () => {
    const filePath = "src/components/dashboard/dashboard-nav-context.tsx";
    const content = `"use client";
export async function load(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return { data, error };
}
`;
    const findings = runSecuritySuiteScan([{ filePath, content }]).filter(
      (item) => item.category === "CLIENT_DB_EXPOSURE"
    );
    expect(findings.length).toBeGreaterThan(0);

    for (const finding of findings) {
      const exact = planSecurityFix({ filePath, content }, "CLIENT_DB_EXPOSURE", finding.line);
      expect(exact).not.toBeNull();
      const client = exact?.writes[0]?.content ?? "";
      expect(client).toContain('from "@/app/actions/secure-query"');
      expect(client).not.toMatch(/import \{\r?\nimport \{ secureQuery/);
      expect(parseOk(filePath, client)).toEqual([]);

      // Every line from `supabase` through the terminal method must plan the same action.
      const snippetLines = (finding.snippet ?? "").split(/\r?\n/).length;
      const spanLines = Math.max(snippetLines, 5);
      for (let offset = 0; offset < spanLines; offset += 1) {
        const line = finding.line + offset;
        const drifted = planSecurityFix({ filePath, content }, "CLIENT_DB_EXPOSURE", line);
        expect(drifted, `null plan for span line ${line} (finding ${finding.line})`).not.toBeNull();
        expect(drifted?.writes[0]?.content).toContain(`secureQuery${finding.line}`);
        expect(parseOk(filePath, drifted?.writes[0]?.content ?? "")).toEqual([]);
      }
    }
  });

  it("relocates a stale report line after a prior patch shifted the file", () => {
    const filePath = "src/components/demo/client-leak.tsx";
    const original = `"use client";

async function loadOrders() {
  const { data } = await supabase
    .from("orders")
    .select("id, total")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

async function loadProfile() {
  const { data } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .maybeSingle();
  return data;
}
`;
    const findings = runSecuritySuiteScan([{ filePath, content: original }]).filter(
      (item) => item.category === "CLIENT_DB_EXPOSURE"
    );
    expect(findings.length).toBeGreaterThanOrEqual(2);
    const profile = findings.find((item) => item.snippet.includes("profiles"));
    expect(profile).toBeDefined();
    const staleLine = profile!.line;
    const snippet = profile!.snippet;

    // Simulate an earlier fix that inserted import + call lines above the second leak.
    const shifted = `"use client";

import { secureQuery3 } from "@/app/actions/secure-query";

async function loadOrders() {
  const { data, error } = await secureQuery3();
  return data;
}

async function loadProfile() {
  const { data } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .maybeSingle();
  return data;
}
`;
    const liveFindings = runSecuritySuiteScan([{ filePath, content: shifted }]).filter(
      (item) => item.category === "CLIENT_DB_EXPOSURE"
    );
    expect(liveFindings).toHaveLength(1);
    expect(liveFindings[0]?.line).not.toBe(staleLine);

    const relocated = relocateSecurityFixTarget(
      { filePath, content: shifted },
      "CLIENT_DB_EXPOSURE",
      staleLine,
      { snippet }
    );
    expect(relocated).not.toBeNull();
    expect(relocated?.line).toBe(liveFindings[0]?.line);
    expect(["fingerprint", "nearest", "span"]).toContain(relocated?.reason);

    const plan = planSecurityFix(
      { filePath, content: shifted },
      "CLIENT_DB_EXPOSURE",
      staleLine,
      null,
      { snippet }
    );
    expect(plan).not.toBeNull();
    expect(plan?.writes[0]?.content).toMatch(/await secureQuery\d+\(/);
    expect(plan?.writes[0]?.content).not.toMatch(/await supabase\s*\n\s*\.from\("profiles"\)/);
    expect(plan?.writes[1]?.content).toContain('from("profiles")');
  });

  it("fingerprints query snippets across whitespace and quote style", () => {
    const a = fingerprintSecurityQuery(`supabase\n  .from("profiles")\n  .select("name")`);
    const b = fingerprintSecurityQuery(`supabase .from('profiles') .select('name')`);
    expect(a).toBe(b);
  });

  it("sanitizes explicit any / as any out of generated TypeScript before commit", () => {
    const dirty = `
export async function secureQuery3(value: any): Promise<{ data: any; error: any }> {
  const rows = value as any;
  const list: Array<any> = [];
  const map: Record<string, any> = {};
  const company = "acme";
  return { data: rows as any[], error: null };
}
`;
    const clean = sanitizeGeneratedTypeScript(dirty, "secure-query.ts");
    expect(clean).not.toMatch(/\bany\b/);
    expect(clean).toContain("value: unknown");
    expect(clean).toContain("data: unknown");
    expect(clean).toContain("error: unknown");
    expect(clean).toContain("as unknown");
    expect(clean).toContain("Array<unknown>");
    expect(clean).toContain("Record<string, unknown>");
    expect(clean).toContain("as unknown[]");
    expect(clean).toContain('const company = "acme"');

    const withComment = sanitizeGeneratedTypeScript(
      `const x: any = 1; // legacy any marker\nconst y = "any";\n`,
      "file.ts"
    );
    expect(withComment).toContain("const x: unknown = 1");
    expect(withComment).toContain("// legacy any marker");
    expect(withComment).toContain('const y = "any"');
  });

  it("applies multiple fixes bottom-up with line shifts, missing @/ imports, stubs, and preflight", async () => {
    const filePath = "src/components/dashboard/dashboard-nav-context.tsx";
    // Missing internal modules force the copy→ambient-stub fallback during preflight.
    const original = `"use client";
import { bootTimeout } from "@/lib/auth-bootstrap-timeout";
import { AuthBootstrapProvider } from "@/lib/auth-bootstrap-context";
import { clientIdentity } from "@/lib/ip-geo-clientidentity";

export async function loadOrders(userId: string) {
  void bootTimeout;
  const { data, error } = await supabase
    .from("orders")
    .select("id, total")
    .eq("user_id", userId)
    .maybeSingle();
  return { data, error };
}

export async function loadProfile(userId: string) {
  void AuthBootstrapProvider;
  const { data, error } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .maybeSingle();
  return { data, error };
}

export async function loadJobs(userId: string) {
  void clientIdentity;
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("owner_id", userId)
    .maybeSingle();
  return { data, error };
}
`;
    const seedFindings = sortFindingsForBatchApply(
      runSecuritySuiteScan([{ filePath, content: original }]).filter(
        (item) => item.category === "CLIENT_DB_EXPOSURE" && item.filePath === filePath
      )
    );
    expect(seedFindings.length).toBe(3);
    // Bottom-up: highest line first so earlier patches cannot invalidate lower targets.
    expect(seedFindings.map((item) => item.line)).toEqual(
      [...seedFindings.map((item) => item.line)].sort((a, b) => b - a)
    );

    // Freeze report coordinates + snippets (Open Fix PR / UI still send the stale line).
    const staleTargets = seedFindings.map((item) => ({
      line: item.line,
      snippet: item.snippet,
      table: /from\s*\(\s*["']([^"']+)["']/.exec(item.snippet)?.[1] ?? "",
    }));
    expect(staleTargets.map((item) => item.table)).toEqual(["jobs", "profiles", "orders"]);

    let liveContent = original;
    let actionContent: string | null = null;
    const helperWrites: Array<{ filePath: string; content: string }> = [];
    const appliedLines: number[] = [];

    for (const target of staleTargets) {
      const beforeFindings = runSecuritySuiteScan([{ filePath, content: liveContent }]).filter(
        (item) => item.category === "CLIENT_DB_EXPOSURE" && item.filePath === filePath
      );
      expect(beforeFindings.length).toBeGreaterThan(0);

      // Stale report line + snippet must relocate after prior patches shifted the file.
      const relocated = relocateSecurityFixTarget(
        { filePath, content: liveContent },
        "CLIENT_DB_EXPOSURE",
        target.line,
        { snippet: target.snippet }
      );
      expect(relocated, `relocate failed for stale L${target.line} (${target.table})`).not.toBeNull();
      if (target !== staleTargets[0]) {
        expect(relocated!.line).not.toBe(target.line);
      }
      appliedLines.push(relocated!.line);

      const plan = planSecurityFix(
        { filePath, content: liveContent },
        "CLIENT_DB_EXPOSURE",
        target.line,
        null,
        { snippet: target.snippet }
      );
      expect(plan, `null plan for stale L${target.line} (${target.table})`).not.toBeNull();
      expect(plan!.writes[0]?.content).toMatch(/await secureQuery\d+\(/);
      expect(plan!.writes[0]?.content).not.toMatch(
        new RegExp(`await supabase\\s*\\n\\s*\\.from\\("${target.table}"\\)`)
      );
      expect(plan!.writes[1]?.content).toContain(`from("${target.table}")`);
      expect(parseOk(filePath, plan!.writes[0]?.content ?? "")).toEqual([]);

      for (const write of plan!.writes) {
        if (write.filePath === filePath) {
          liveContent = write.content;
          continue;
        }
        if (isServerActionFilePath(write.filePath)) {
          actionContent = mergeServerAction(actionContent, write.content);
          continue;
        }
        if (!helperWrites.some((entry) => entry.filePath === write.filePath)) {
          helperWrites.push({ filePath: write.filePath, content: write.content });
        }
      }

      const remaining = runSecuritySuiteScan([{ filePath, content: liveContent }]).filter(
        (item) => item.category === "CLIENT_DB_EXPOSURE" && item.filePath === filePath
      );
      expect(remaining.length).toBe(beforeFindings.length - 1);
    }

    expect(appliedLines.length).toBe(3);
    expect(
      runSecuritySuiteScan([{ filePath, content: liveContent }]).filter(
        (item) => item.category === "CLIENT_DB_EXPOSURE"
      )
    ).toHaveLength(0);
    // Missing internal imports must survive every patch (stubs depend on them).
    expect(liveContent).toContain('from "@/lib/auth-bootstrap-timeout"');
    expect(liveContent).toContain('from "@/lib/auth-bootstrap-context"');
    expect(liveContent).toContain('from "@/lib/ip-geo-clientidentity"');
    expect(liveContent).toContain('from "@/app/actions/secure-query"');
    expect(liveContent).toMatch(/secureQuery\d+/);
    expect(actionContent).toContain('from("jobs")');
    expect(actionContent).toContain('from("profiles")');
    expect(actionContent).toContain('from("orders")');

    const finalWrites = [
      { filePath, content: liveContent },
      { filePath: "src/app/actions/secure-query.ts", content: actionContent ?? "" },
      ...helperWrites,
    ];

    const host = await loadHostTsconfigPaths(process.cwd());
    const bundled = await bundleInternalAliasWrites(finalWrites, {
      projectRoot: process.cwd(),
      hostPaths: host.paths,
      aliasRoot: host.aliasRoot,
    });
    const unresolved = collectUnresolvedAtAliasSpecifiers(bundled, {
      projectRoot: process.cwd(),
      hostPaths: host.paths,
      aliasRoot: host.aliasRoot,
    });
    expect(unresolved).toEqual(
      expect.arrayContaining([
        "@/lib/auth-bootstrap-timeout",
        "@/lib/auth-bootstrap-context",
        "@/lib/ip-geo-clientidentity",
      ])
    );
    expect(unresolved).not.toContain("@/app/actions/secure-query");

    const preflight = await runAutofixTscPreflight(finalWrites);
    expect(preflight).toEqual({ success: true });
  }, 90_000);
});
