import { describe, expect, it } from "vitest";
import { finalizeAutofixWrites } from "@/lib/autofix-write-validation";
import {
  actionablePreflightDiagnostics,
  assertAutofixTscPreflightPasses,
  bundleInternalAliasGraph,
  bundleInternalAliasWrites,
  collectInternalImportSpecifiers,
  collectUnresolvedAtAliasSpecifiers,
  loadHostTsconfigPaths,
  runAutofixTscPreflight,
} from "@/lib/autofix-tsc-preflight";
import { SUPABASE_SERVER_HELPER } from "@/lib/scanner/security-suite";

const helper = {
  filePath: "src/utils/supabase/server.ts",
  content: SUPABASE_SERVER_HELPER.endsWith("\n") ? SUPABASE_SERVER_HELPER : `${SUPABASE_SERVER_HELPER}\n`,
};

const validAction = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function secureQuery3() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: { message: "Unauthorized" } };
  }
  const { data, error } = await supabase.from("jobs").select("*");
  return { data, error };
}
`;

const validClient = `"use client";
import { secureQuery3 } from "@/app/actions/secure-query";
export async function load() {
  return await secureQuery3();
}
`;

describe("actionablePreflightDiagnostics", () => {
  it("ignores TS2318/TS6053 missing typescript lib files (Vercel /var/task gaps)", () => {
    const noise = [
      "error TS2318: Cannot find global type 'Array'.",
      "error TS2318: Cannot find global type 'Promise'.",
      "error TS6053: File '/var/task/node_modules/typescript/lib/lib.dom.d.ts' not found.",
      "__provix_stubs__/ambient-modules.d.ts(1,1): error TS2584: Do you need to change your target library?",
    ].join("\n");
    expect(actionablePreflightDiagnostics(noise)).toEqual([]);
  });

  it("keeps real unbound identifier failures", () => {
    const real = "src/lib/x.ts(1,1): error TS2304: Cannot find name 'writes'.";
    expect(actionablePreflightDiagnostics(real)).toEqual([real]);
  });
});

describe("runAutofixTscPreflight", () => {
  it("passes a coherent security patch through real tsc", async () => {
    const result = await runAutofixTscPreflight([
      { filePath: "src/components/jobs.tsx", content: validClient },
      { filePath: "src/app/actions/secure-query.ts", content: validAction },
      helper,
    ]);
    expect(result).toEqual(expect.objectContaining({ success: true }));
  }, 90_000);

  it("rejects a module split that leaves an unbound helper (PR #71 class)", async () => {
    const result = await runAutofixTscPreflight([
      {
        filePath: "src/lib/demo-split.ts",
        content: `export { openAutofixPullRequest } from "./demo-split/openautofixpullrequest";\n`,
      },
      {
        filePath: "src/lib/demo-split/openautofixpullrequest.ts",
        content: [
          "export async function openAutofixPullRequest() {",
          "  return writes.map((write) => write.filePath);",
          "}",
          "",
        ].join("\n"),
      },
    ]);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.message).toMatch(/tsc --noEmit/i);
    expect(result.diagnostics).toMatch(/writes/i);
  }, 90_000);

  it("assertAutofixTscPreflightPasses resolves for a valid security patch", async () => {
    await expect(
      assertAutofixTscPreflightPasses([
        { filePath: "src/components/jobs.tsx", content: validClient },
        { filePath: "src/app/actions/secure-query.ts", content: validAction },
        helper,
      ])
    ).resolves.toEqual({ mode: "full", stubCount: 0 });
  }, 90_000);

  it("finalizeAutofixWrites opens the path when heal and preflight pass", async () => {
    const finalized = await finalizeAutofixWrites([
      { filePath: "src/components/jobs.tsx", content: validClient },
      { filePath: "src/app/actions/secure-query.ts", content: validAction },
      helper,
    ]);
    expect(finalized.ok).toBe(true);
    if (!finalized.ok) return;
    expect(finalized.writes.some((write) => write.filePath.endsWith("utils/supabase/server.ts"))).toBe(true);
  }, 90_000);

  it("records missing @/ modules during alias collection", async () => {
    const client = [
      '"use client";',
      'import { bootTimeout } from "@/lib/auth-bootstrap-timeout";',
      'import { AuthBootstrapProvider } from "@/lib/auth-bootstrap-context";',
      'import { clientIdentity } from "@/lib/ip-geo-clientidentity";',
      'import { createClient } from "@/utils/supabase/client";',
      "",
      "export async function boot() {",
      "  void bootTimeout;",
      "  void AuthBootstrapProvider;",
      "  void clientIdentity;",
      '  return supabase.from("profiles").select("id");',
      "}",
      "",
    ].join("\n");

    const { planSecurityFix } = await import("@/lib/scanner/security-suite");
    const plan = planSecurityFix(
      { filePath: "src/components/dashboard/dashboard-nav-context.tsx", content: client },
      "CLIENT_DB_EXPOSURE",
      11
    );
    expect(plan).not.toBeNull();
    if (!plan) return;

    const host = await loadHostTsconfigPaths(process.cwd());
    const graph = await bundleInternalAliasGraph(plan.writes, {
      projectRoot: process.cwd(),
      hostPaths: host.paths,
      aliasRoot: host.aliasRoot,
    });
    expect(graph.missingAtAliases).toEqual(
      expect.arrayContaining([
        "@/lib/auth-bootstrap-timeout",
        "@/lib/auth-bootstrap-context",
        "@/lib/ip-geo-clientidentity",
      ])
    );
    const unresolved = collectUnresolvedAtAliasSpecifiers(graph.writes, {
      projectRoot: process.cwd(),
      hostPaths: host.paths,
      aliasRoot: host.aliasRoot,
      collectionMisses: graph.missingAtAliases,
    });
    expect(unresolved).toEqual(
      expect.arrayContaining([
        "@/lib/auth-bootstrap-timeout",
        "@/lib/auth-bootstrap-context",
        "@/lib/ip-geo-clientidentity",
      ])
    );
    expect(unresolved).not.toContain("@/utils/supabase/client");
    expect(await runAutofixTscPreflight(plan.writes)).toEqual(expect.objectContaining({ success: true }));
  });

  it("mirrors host tsconfig @/* path aliases into the preflight bundle", async () => {
    const host = await loadHostTsconfigPaths(process.cwd());
    expect(host.paths["@/*"]).toBeDefined();
    expect(host.aliasRoot).toBe("src");

    const specs = collectInternalImportSpecifiers(`
      import "@/lib/auth-session-timeout";
      import { AUTH_SESSION_TIMEOUT_MS } from "@/lib/auth-session-timeout";
      export { isAdminUser } from "@/lib/admin-access";
    `);
    expect(specs).toEqual(
      expect.arrayContaining([
        "@/lib/auth-session-timeout",
        "@/lib/admin-access",
      ])
    );

    const client = [
      '"use client";',
      'import { AUTH_SESSION_TIMEOUT_MS } from "@/lib/auth-session-timeout";',
      'import { isAdminUser } from "@/lib/admin-access";',
      'import { createClient } from "@/utils/supabase/client";',
      "",
      "export async function boot() {",
      "  void AUTH_SESSION_TIMEOUT_MS;",
      "  void isAdminUser;",
      '  return supabase.from("profiles").select("id");',
      "}",
      "",
    ].join("\n");

    const { planSecurityFix } = await import("@/lib/scanner/security-suite");
    const plan = planSecurityFix(
      { filePath: "src/components/dashboard/dashboard-nav-context.tsx", content: client },
      "CLIENT_DB_EXPOSURE",
      9
    );
    expect(plan).not.toBeNull();
    if (!plan) return;

    const bundled = await bundleInternalAliasWrites(plan.writes, {
      projectRoot: process.cwd(),
      hostPaths: host.paths,
      aliasRoot: host.aliasRoot,
    });
    const paths = bundled.map((write) => write.filePath);
    expect(paths).toContain("src/lib/auth-session-timeout.ts");
    expect(paths).toContain("src/lib/admin-access.ts");
    expect(paths).toContain("src/utils/supabase/client.ts");
    expect(await runAutofixTscPreflight(plan.writes)).toEqual(expect.objectContaining({ success: true }));
  });

  it("recursively copies @/lib and @/utils modules into the preflight bundle", async () => {
    const actionWithLib = `"use server";
import { createClient } from "@/utils/supabase/server";
import { isAdminUser } from "@/lib/admin-access";
import { createClient as createBrowserClient } from "@/utils/supabase/client";

export async function secureQuery3() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user as never)) {
    return { data: null, error: { message: "Unauthorized" } };
  }
  void createBrowserClient;
  const { data, error } = await supabase.from("jobs").select("*");
  return { data, error };
}
`;
    const bundled = await bundleInternalAliasWrites([
      { filePath: "src/app/actions/secure-query.ts", content: actionWithLib },
      helper,
    ]);
    const paths = bundled.map((write) => write.filePath).sort();
    expect(paths).toContain("src/lib/admin-access.ts");
    expect(paths).toContain("src/utils/supabase/client.ts");
    expect(paths).toContain("src/lib/supabaseClient.ts");
    expect(
      await runAutofixTscPreflight([
        { filePath: "src/components/jobs.tsx", content: validClient },
        { filePath: "src/app/actions/secure-query.ts", content: actionWithLib },
        helper,
      ])
    ).toEqual(expect.objectContaining({ success: true }));
  });
});
