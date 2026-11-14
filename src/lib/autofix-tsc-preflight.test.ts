import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeAutofixWrites } from "@/lib/autofix-write-validation";
import {
  AUTOFIX_ROUTE_MAX_DURATION_MS,
  actionablePreflightDiagnostics,
  assertAutofixTscPreflightPasses,
  buildTscPreflightEnv,
  formatAutofixTscFailure,
  bundleInternalAliasGraph,
  bundleInternalAliasWrites,
  collectExternalPackageSpecifiers,
  collectInternalImportSpecifiers,
  collectUnresolvedAtAliasSpecifiers,
  expandAmbientStubModules,
  hardPreflightFailureFromChild,
  hostPackageHasTypes,
  isValidAmbientModuleName,
  loadHostTsconfigPaths,
  removeOwnedPreflightTempDir,
  runAutofixTscPreflight,
  spawnPreflightNodeChild,
  TSC_PREFLIGHT_TIMEOUT_MS,
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

  it("ignores missing declaration files from the sandbox bundle", () => {
    const noise = [
      "score-trend-chart.tsx(3,19): error TS7016: Could not find a declaration file for module 'react'. '/var/task/node_modules/react/index.js' implicitly has an 'any' type.",
      "chart.tsx(1,1): error TS7016: Could not find a declaration file for module 'recharts'.",
      "tsconfig.json(1,1): error TS2688: Cannot find type definition file for 'node'.",
    ].join("\n");
    expect(actionablePreflightDiagnostics(noise)).toEqual([]);
  });

  it("keeps every diagnostic line and puts patched-file errors first", () => {
    const unrelated = "src/lib/other.ts(1,1): error TS2709: Cannot use namespace 'Metadata' as a type.";
    const patched = "src/app/actions/secure-query.ts(4,1): error TS2305: Module '\"@/app/actions/secure-query\"' has no exported member 'secureQuery184'.";
    const message = formatAutofixTscFailure([unrelated, patched], ["src/app/actions/secure-query.ts"]);
    expect(message).toContain(unrelated);
    expect(message).toContain(patched);
    expect(message.indexOf(patched)).toBeLessThan(message.indexOf(unrelated));
  });

  it("keeps real unbound identifier failures", () => {
    const real = "src/lib/x.ts(1,1): error TS2304: Cannot find name 'writes'.";
    expect(actionablePreflightDiagnostics(real)).toEqual([real]);
  });
});

describe("collectExternalPackageSpecifiers", () => {
  it("stubs next subpaths even though the next package has types", () => {
    const specs = collectExternalPackageSpecifiers([
      {
        filePath: "src/components/dashboard/dashboard-nav-context/auth-bootstrap-timeout-ms.tsx",
        content: `import { useRouter } from "next/navigation";\nexport const ms = 1;\n`,
      },
    ]);
    expect(specs).toContain("next/navigation");
  });
});

describe("hostPackageHasTypes / react stubs", () => {
  it("treats react as typed only when @types/react (or bundled types) exist", () => {
    // This workspace installs @types/react — so Open Fix can use real types locally.
    expect(hostPackageHasTypes(process.cwd(), "react")).toBe(true);
  });

  it("does not treat a JS-only package.json as typed", async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const root = await mkdtemp(path.join(tmpdir(), "provix-types-"));
    try {
      const reactDir = path.join(root, "node_modules", "react");
      await mkdir(reactDir, { recursive: true });
      await writeFile(
        path.join(reactDir, "package.json"),
        JSON.stringify({ name: "react", main: "index.js" }),
        "utf8"
      );
      expect(hostPackageHasTypes(root, "react")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("expands react stubs to jsx-runtime subpaths and allows those module names", () => {
    expect(expandAmbientStubModules(["react"])).toEqual([
      "react",
      "react/jsx-dev-runtime",
      "react/jsx-runtime",
    ]);
    expect(isValidAmbientModuleName("react/jsx-runtime")).toBe(true);
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

  it("does not fail when a copied file imports next/navigation", async () => {
    const result = await runAutofixTscPreflight([
      {
        filePath: "src/components/dashboard/dashboard-nav-context/auth-bootstrap-timeout-ms.tsx",
        content: [
          'import { useRouter } from "next/navigation";',
          "export function timeoutMs() {",
          "  void useRouter;",
          "  return 15;",
          "}",
          "",
        ].join("\n"),
      },
    ]);
    expect(result).toEqual(expect.objectContaining({ success: true }));
  }, 90_000);

  it("does not fail when a stubbed any result leaves a callback parameter unannotated", async () => {
    const result = await runAutofixTscPreflight([
      {
        filePath: "src/components/dashboard/score-trend-chart.tsx",
        content: [
          "const data: any = [];",
          "export const points = (data ?? []).map((row) => row.id);",
          "",
        ].join("\n"),
      },
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

  it("accepts NextResponse and Metadata type annotations", async () => {
    const result = await runAutofixTscPreflight([
      {
        filePath: "src/lib/next-type-probe.ts",
        content: [
          'import { NextResponse } from "next/server";',
          'import type { Metadata } from "next";',
          "export function reply(response: NextResponse): NextResponse {",
          "  return response ?? NextResponse.json({ ok: true });",
          "}",
          "export function meta(): Metadata {",
          '  return { title: "ok", description: "d" };',
          "}",
          "",
        ].join("\n"),
      },
    ]);
    expect(result.success).toBe(true);
  }, 90_000);

  it("assertAutofixTscPreflightPasses resolves for a valid security patch", async () => {
    // The server helper imports next/headers; preflight ambient-stubs next/*
    // so sandbox typecheck does not fail on App Router modules.
    await expect(
      assertAutofixTscPreflightPasses([
        { filePath: "src/components/jobs.tsx", content: validClient },
        { filePath: "src/app/actions/secure-query.ts", content: validAction },
        helper,
      ])
    ).resolves.toEqual({ mode: "stubbed", stubCount: 1 });
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
  }, 90_000);

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
  }, 90_000);

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
  }, 90_000);
});

describe("tsc preflight execution hardening", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the child timeout under the autofix route budget with cleanup margin", () => {
    expect(AUTOFIX_ROUTE_MAX_DURATION_MS).toBe(60_000);
    expect(TSC_PREFLIGHT_TIMEOUT_MS).toBeLessThan(AUTOFIX_ROUTE_MAX_DURATION_MS);
    // Leave headroom for materialization, cleanup, and response writing.
    expect(AUTOFIX_ROUTE_MAX_DURATION_MS - TSC_PREFLIGHT_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
  });

  it("buildTscPreflightEnv copies only allowlisted keys and drops app secrets", () => {
    const env = buildTscPreflightEnv({
      PATH: "/usr/bin",
      Path: "C:\\Windows\\System32",
      TEMP: "C:\\Temp",
      TMPDIR: "/tmp",
      HOME: "/home/provix",
      USERPROFILE: "C:\\Users\\provix",
      SystemRoot: "C:\\Windows",
      GITHUB_APP_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----",
      GITHUB_WEBHOOK_SECRET: "whsec_test",
      GITHUB_TOKEN: "ghp_test",
      SUPABASE_SERVICE_ROLE_KEY: "service_role_secret",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon_key",
      OPENAI_API_KEY: "sk-test",
      GEMINI_API_KEY: "gem-test",
      ANTHROPIC_API_KEY: "ant-test",
      NODE_OPTIONS: "--require ./evil-preload.js",
      PROVIX_AUTONOMOUS_WEBHOOK_HEAL: "true",
      SECRET_PAYLOAD: "should-never-pass",
    });

    expect(env.PATH).toBe("/usr/bin");
    expect(env.Path).toBe("C:\\Windows\\System32");
    expect(env.TEMP).toBe("C:\\Temp");
    expect(env.TMPDIR).toBe("/tmp");
    expect(env.HOME).toBe("/home/provix");
    expect(env.USERPROFILE).toBe("C:\\Users\\provix");
    expect(env.SystemRoot).toBe("C:\\Windows");

    expect(env.GITHUB_APP_PRIVATE_KEY).toBeUndefined();
    expect(env.GITHUB_WEBHOOK_SECRET).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.PROVIX_AUTONOMOUS_WEBHOOK_HEAL).toBeUndefined();
    expect(env.SECRET_PAYLOAD).toBeUndefined();
    // Never silently expand to the full parent env.
    expect(Object.keys(env).sort()).toEqual(
      ["HOME", "PATH", "Path", "SystemRoot", "TEMP", "TMPDIR", "USERPROFILE"].sort()
    );
  });

  it("terminates a hung child when the preflight deadline elapses", async () => {
    const started = Date.now();
    const result = await spawnPreflightNodeChild(["-e", "setInterval(() => {}, 1000)"], {
      cwd: process.cwd(),
      timeoutMs: 250,
    });
    const elapsed = Date.now() - started;
    expect(result.timedOut).toBe(true);
    expect(result.code).toBe(1);
    expect(result.spawnFailed).toBe(false);
    expect(result.stderr).toMatch(/preflight timed out after 250ms/);
    expect(elapsed).toBeLessThan(5_000);
  }, 10_000);

  it("hardPreflightFailureFromChild treats timeout/spawn/signal/null exits as failures", () => {
    expect(
      hardPreflightFailureFromChild({
        code: 1,
        stdout: "",
        stderr: "preflight timed out after 250ms",
        timedOut: true,
        spawnFailed: false,
        signal: null,
      }, 250)
    ).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/timed out after 250ms/i),
      })
    );
    expect(
      hardPreflightFailureFromChild({
        code: 1,
        stdout: "",
        stderr: "spawn ENOENT",
        timedOut: false,
        spawnFailed: true,
        signal: null,
      })
    ).toEqual(expect.objectContaining({ success: false, message: expect.stringMatching(/failed to start/i) }));
    expect(
      hardPreflightFailureFromChild({
        code: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        spawnFailed: false,
        signal: "SIGKILL",
      })
    ).toEqual(expect.objectContaining({ success: false, message: expect.stringMatching(/signal SIGKILL/i) }));
    expect(
      hardPreflightFailureFromChild({
        code: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        spawnFailed: false,
        signal: null,
      })
    ).toEqual(expect.objectContaining({ success: false, message: expect.stringMatching(/abnormally/i) }));
    // Ordinary non-zero tsc exit is not a hard abnormal failure — diagnostics decide.
    expect(
      hardPreflightFailureFromChild({
        code: 1,
        stdout: "error TS2304: Cannot find name 'writes'.",
        stderr: "",
        timedOut: false,
        spawnFailed: false,
        signal: null,
      })
    ).toBeNull();
  });

  it("runAutofixTscPreflight hard-fails when the TypeScript child times out", async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), "provix-hang-tsc-"));
    try {
      const binDir = path.join(projectRoot, "node_modules", "typescript", "bin");
      const libDir = path.join(projectRoot, "node_modules", "typescript", "lib");
      await mkdir(binDir, { recursive: true });
      await mkdir(libDir, { recursive: true });
      // Satisfy typescriptLibDirectory so preflight does not skip-no-lib.
      await writeFile(path.join(libDir, "lib.es2022.d.ts"), "export {};\n", "utf8");
      await writeFile(path.join(libDir, "lib.d.ts"), "export {};\n", "utf8");
      // Hang forever — no TS diagnostics, so a soft gate would wrongly pass.
      await writeFile(path.join(binDir, "tsc"), "setInterval(() => {}, 1000);\n", "utf8");

      const result = await runAutofixTscPreflight(
        [{ filePath: "src/ok.ts", content: "export const ok = 1;\n" }],
        { projectRoot, timeoutMs: 300 }
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.message).toMatch(/timed out/i);
      expect(result.diagnostics).toMatch(/preflight timed out after 300ms/);
      // Missing actionable TS diagnostics must not convert timeout into a pass.
      expect(actionablePreflightDiagnostics(result.diagnostics)).toEqual([]);
    } finally {
      await removeOwnedPreflightTempDir(projectRoot);
    }
  }, 15_000);

  it("removes owned temp directories on cleanup", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "provix-autofix-tsc-"));
    await writeFile(path.join(dir, "marker.txt"), "cleanup-me\n", "utf8");
    expect(existsSync(dir)).toBe(true);
    await removeOwnedPreflightTempDir(dir);
    expect(existsSync(dir)).toBe(false);
  });

  it("logs cleanup failures without dumping absolute paths or file contents", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // NUL in the path is rejected by Node/libuv and reliably hits the catch path.
    const poisoned = `${path.join(tmpdir(), "provix-autofix-tsc-secret-name")}\0trail`;
    await removeOwnedPreflightTempDir(poisoned);
    expect(errorSpy).toHaveBeenCalledWith(
      "[autofix/tsc-preflight] temp cleanup failed",
      expect.objectContaining({
        dir: expect.any(String),
        message: expect.any(String),
      })
    );
    const detail = errorSpy.mock.calls.find(
      (call) => call[0] === "[autofix/tsc-preflight] temp cleanup failed"
    )?.[1] as { dir: string; message: string };
    expect(detail.message.length).toBeLessThanOrEqual(200);
    // Basename only — never the full temp root or repository file bodies.
    expect(detail.dir).toMatch(/^provix-autofix-tsc-/);
    expect(detail.dir).not.toContain(path.sep);
    expect(JSON.stringify(detail)).not.toContain("secret-payload-body");
  });

  it("does not delete caller-provided work directories", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "provix-caller-work-"));
    try {
      const result = await runAutofixTscPreflight(
        [
          { filePath: "src/components/jobs.tsx", content: validClient },
          { filePath: "src/app/actions/secure-query.ts", content: validAction },
          helper,
        ],
        { workDir }
      );
      expect(result.success).toBe(true);
      expect(existsSync(workDir)).toBe(true);
      expect(existsSync(path.join(workDir, "tsconfig.json"))).toBe(true);
    } finally {
      await removeOwnedPreflightTempDir(workDir);
    }
  }, 90_000);
});
