import { describe, expect, it } from "vitest";
import { healAutofixWrites, validateAutofixWrites } from "@/lib/autofix-write-validation";
import { SUPABASE_SERVER_HELPER } from "@/lib/scanner/security-suite";

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

const validHelper = {
  filePath: "src/utils/supabase/server.ts",
  content: SUPABASE_SERVER_HELPER.endsWith("\n") ? SUPABASE_SERVER_HELPER : `${SUPABASE_SERVER_HELPER}\n`,
};

describe("validateAutofixWrites", () => {
  it("accepts a matched client import and server action", () => {
    const result = validateAutofixWrites([
      {
        filePath: "src/components/jobs.tsx",
        content: `"use client";\nimport { secureQuery3 } from "@/app/actions/secure-query";\nexport async function load() {\n  return await secureQuery3();\n}\n`,
      },
      { filePath: "src/app/actions/secure-query.ts", content: validAction },
      validHelper,
    ]);
    expect(result).toEqual({ ok: true });
  });

  it("rejects when a createClient helper import is not bundled into the commit", () => {
    const result = validateAutofixWrites([
      {
        filePath: "src/components/jobs.tsx",
        content: `"use client";\nimport { secureQuery3 } from "@/app/actions/secure-query";\nexport async function load() {\n  return await secureQuery3();\n}\n`,
      },
      { filePath: "src/app/actions/secure-query.ts", content: validAction },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing-support-file");
      expect(result.message).toContain("src/utils/supabase/server.ts");
    }
  });

  it("rejects syntax errors before any GitHub write", () => {
    const result = validateAutofixWrites([
      {
        filePath: "src/components/jobs.tsx",
        content: `"use client";\nexport function broken( {\n`,
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("syntax check");
      expect(result.message).toContain("was not opened");
    }
  });

  it("rejects chaining query methods onto the server action call", () => {
    const result = validateAutofixWrites([
      {
        filePath: "src/components/jobs.tsx",
        content: `"use client";\nimport { secureQuery3 } from "@/app/actions/secure-query";\nexport async function load() {\n  return await secureQuery3().select("*");\n}\n`,
      },
      { filePath: "src/app/actions/secure-query.ts", content: validAction },
      validHelper,
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("chains query methods");
    }
  });

  it("rejects a client import when the server action file is missing", () => {
    const result = validateAutofixWrites([
      {
        filePath: "src/components/jobs.tsx",
        content: `"use client";\nimport { secureQuery3 } from "@/app/actions/secure-query";\nexport async function load() {\n  return await secureQuery3();\n}\n`,
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("server action file was not included");
    }
  });

  it("ignores secure-query mentions inside test string literals", () => {
    const result = validateAutofixWrites([
      {
        filePath: "src/app/api/webhooks/github/github-webhook-gate.test.ts",
        content: `import { describe, expect, it } from "vitest";\nfunction recordingClient() { return { commits: [] }; }\nexport function recordingclient() {\n  expect(client).toContain('from "@/app/actions/secure-query"');\n  return recordingClient();\n}\n`,
      },
      {
        filePath: "src/app/api/webhooks/github/github-webhook-gate.test/recordingclient.ts",
        content: `export function recordingClient() {\n  expect("x").toContain('from "@/app/actions/secure-query"');\n  return {};\n}\n`,
      },
    ]);
    expect(result).toEqual({ ok: true });
  });

  it("allows architecture splits that keep an existing secure-query import without re-committing the action", () => {
    const result = validateAutofixWrites([
      {
        filePath: "src/app/login/page.tsx",
        content: `export { LoginForm as default } from "./page/loginform";\n`,
      },
      {
        filePath: "src/app/login/page/loginform.tsx",
        content: `"use client";\nimport { secureQuery95 } from "@/app/actions/secure-query";\nexport async function LoginForm() {\n  return await secureQuery95();\n}\n`,
      },
    ]);
    expect(result).toEqual({ ok: true });
  });

  it("rejects invalid package.json writes", () => {
    const result = validateAutofixWrites([{ filePath: "package.json", content: "{ broken" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("not valid JSON");
    }
  });

  it("self-heals a broken patch and passes on retry", () => {
    const healed = healAutofixWrites([
      {
        filePath: "src/components/jobs.tsx",
        content: `"use client";\nexport async function load() {\n  return await secureQuery3().select("*");\n}\n`,
      },
      {
        filePath: "src/app/actions/secure-query.ts",
        content: `export async function secureQuery3() {\n  return supabase.from("jobs").select("*");\n}\n`,
      },
    ]);

    expect(healed.ok).toBe(true);
    if (!healed.ok) return;
    expect(healed.attempts).toBeGreaterThan(1);
    expect(healed.attempts).toBeLessThanOrEqual(3);
    expect(validateAutofixWrites(healed.writes)).toEqual({ ok: true });

    const client = healed.writes.find((write) => write.filePath.endsWith("jobs.tsx"))?.content ?? "";
    const action = healed.writes.find((write) => write.filePath.endsWith("secure-query.ts"))?.content ?? "";
    expect(client).toContain('from "@/app/actions/secure-query"');
    expect(client).toContain("await secureQuery3()");
    expect(client).not.toMatch(/secureQuery3\(\)\s*\./);
    expect(action).toContain('"use server"');
    expect(action).toContain('from "@/utils/supabase/server"');
    expect(action).toContain("supabase.auth.getUser()");
    expect(action).toContain("return { data, error };");
    const helper = healed.writes.find((write) => write.filePath.endsWith("utils/supabase/server.ts"))?.content ?? "";
    expect(helper).toContain("export async function createClient()");
  });

  it("self-heals a commit that omitted the createClient helper file", () => {
    const healed = healAutofixWrites([
      {
        filePath: "src/components/jobs.tsx",
        content: `"use client";\nimport { secureQuery3 } from "@/app/actions/secure-query";\nexport async function load() {\n  return await secureQuery3();\n}\n`,
      },
      { filePath: "src/app/actions/secure-query.ts", content: validAction },
    ]);
    expect(healed.ok).toBe(true);
    if (!healed.ok) return;
    expect(healed.writes.some((write) => write.filePath === "src/utils/supabase/server.ts")).toBe(true);
    expect(validateAutofixWrites(healed.writes)).toEqual({ ok: true });
  });

  it("aborts after 3 attempts when the patch cannot be repaired", () => {
    const healed = healAutofixWrites([
      { filePath: "src/components/jobs.tsx", content: `"use client";\nexport function broken( {\n` },
    ]);
    expect(healed.ok).toBe(false);
    if (healed.ok) return;
    expect(healed.attempts).toBe(3);
    expect(healed.message).toContain("syntax check");
    expect(healed.message).toContain("was not opened");
  });

  it("rejects a user parameter that collides with getUser() before GitHub writes", () => {
    const result = validateAutofixWrites([
      {
        filePath: "src/app/login/page.tsx",
        content: `"use client";\nimport { secureQuery95 } from "@/app/actions/secure-query";\nexport async function go(user: { id: string }) {\n  return await secureQuery95(user);\n}\n`,
      },
      {
        filePath: "src/app/actions/secure-query.ts",
        content: `"use server";\n\nimport { createClient } from "@/utils/supabase/server";\n\nexport async function secureQuery95(user: string | number | boolean | null) {\n  const supabase = await createClient();\n  const {\n    data: { user },\n  } = await supabase.auth.getUser();\n  if (!user) {\n    return { data: null, error: { message: "Unauthorized" } };\n  }\n  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id);\n  return { data, error };\n}\n`,
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code === "duplicate-user-binding" || result.code === "type-boundary" || result.code === "typecheck").toBe(
        true
      );
    }
  });

  it("self-heals the PR #41 user/param type-boundary failure", () => {
    const healed = healAutofixWrites([
      {
        filePath: "src/app/login/page.tsx",
        content: `"use client";\nimport { secureQuery95 } from "@/app/actions/secure-query";\nexport async function go(user: { id: string }) {\n  const { data } = await secureQuery95(user);\n  return data;\n}\n`,
      },
      {
        filePath: "src/app/actions/secure-query.ts",
        content: `"use server";\n\nimport { createClient } from "@/utils/supabase/server";\n\nexport async function secureQuery95(user: string | number | boolean | null) {\n  const supabase = await createClient();\n  const {\n    data: { user },\n  } = await supabase.auth.getUser();\n  if (!user) {\n    return { data: null, error: { message: "Unauthorized" } };\n  }\n  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id);\n  return { data, error };\n}\n`,
      },
    ]);

    expect(healed.ok).toBe(true);
    if (!healed.ok) return;
    expect(healed.attempts).toBeGreaterThan(1);
    expect(validateAutofixWrites(healed.writes)).toEqual({ ok: true });

    const client = healed.writes.find((write) => write.filePath.endsWith("page.tsx"))?.content ?? "";
    const action = healed.writes.find((write) => write.filePath.endsWith("secure-query.ts"))?.content ?? "";
    expect(client).toContain("secureQuery95()");
    expect(client).not.toContain("secureQuery95(user)");
    expect(action).toContain("export async function secureQuery95()");
    expect(action).not.toMatch(/secureQuery95\(\s*user\s*:/);
    expect(action).toContain("user.id");
  });

  it("self-heals mangled object .eq() coercion from the old generator", () => {
    const healed = healAutofixWrites([
      {
        filePath: "src/components/dashboard/dashboard-nav-context.tsx",
        content: `"use client";\nimport { secureQuery3 } from "@/app/actions/secure-query";\nexport async function load(profile: { id: string }) {\n  return await secureQuery3(profile);\n}\n`,
      },
      {
        filePath: "src/app/actions/secure-query.ts",
        content: `"use server";\n\nimport { createClient } from "@/utils/supabase/server";\n\nexport async function secureQuery3(profile: string | undefined) {\n  const supabase = await createClient();\n  const {\n    data: { user },\n  } = await supabase.auth.getUser();\n  if (!user) {\n    return { data: null, error: { message: "Unauthorized" } };\n  }\n  const { data, error } = await supabase.from("profiles").select("*").eq("id", profile == null ? undefined : String(profile).id).maybeSingle();\n  return { data, error };\n}\n`,
      },
    ]);

    expect(healed.ok).toBe(true);
    if (!healed.ok) return;
    expect(validateAutofixWrites(healed.writes)).toEqual({ ok: true });
    const action = healed.writes.find((write) => write.filePath.endsWith("secure-query.ts"))?.content ?? "";
    expect(action).toContain("profile: { id: string } | undefined");
    expect(action).toContain('eq("id", profile?.id == null ? undefined : String(profile.id))');
    expect(action).not.toContain("String(profile).id");
  });

  it("self-heals boolean/number/null filter literals that fail the Supabase string .eq() stub", () => {
    const helper = {
      filePath: "src/utils/supabase/server.ts",
      content: `export async function createClient() {\n  return {\n    auth: { getUser: async () => ({ data: { user: { id: "1" } } }) },\n    from: () => ({}),\n  };\n}\n`,
    };
    const healed = healAutofixWrites([
      {
        filePath: "src/components/jobs.tsx",
        content: `"use client";\nimport { secureQuery3 } from "@/app/actions/secure-query";\nexport async function load(isActive: boolean) {\n  return await secureQuery3(isActive);\n}\n`,
      },
      {
        filePath: "src/app/actions/secure-query.ts",
        content: `"use server";\n\nimport { createClient } from "@/utils/supabase/server";\n\nexport async function secureQuery3(isActive: string | undefined) {\n  const supabase = await createClient();\n  const {\n    data: { user },\n  } = await supabase.auth.getUser();\n  if (!user) {\n    return { data: null, error: { message: "Unauthorized" } };\n  }\n  const { data, error } = await supabase.from("jobs").select("*").eq("active", true).eq("priority", 2).eq("is_active", isActive).eq("deleted_at", null);\n  return { data, error };\n}\n`,
      },
      helper,
    ]);

    expect(healed.ok).toBe(true);
    if (!healed.ok) return;
    expect(validateAutofixWrites(healed.writes)).toEqual({ ok: true });
    const action = healed.writes.find((write) => write.filePath.endsWith("secure-query.ts"))?.content ?? "";
    expect(action).toContain('.is("active", true)');
    expect(action).toContain('.eq("priority", String(2))');
    expect(action).toContain("isActive: boolean | null | undefined");
    expect(action).toContain('.is("is_active", isActive ?? null)');
    expect(action).toContain('.is("deleted_at", null)');
    expect(action).toContain('code: "401"');
  });
});
