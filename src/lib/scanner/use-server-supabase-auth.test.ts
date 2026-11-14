import { describe, expect, it } from "vitest";
import {
  hasFileLevelUseServer,
  scanFilesForUseServerSupabaseAuth,
  scanSourceForUseServerSupabaseAuth,
} from "@/lib/scanner/use-server-supabase-auth";
import ts from "typescript";

describe("scanSourceForUseServerSupabaseAuth", () => {
  it("flags a file-level use server action that queries Supabase without getUser", () => {
    const content = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function listProfiles() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("*");
  return { data, error };
}
`;

    const violations = scanSourceForUseServerSupabaseAuth("src/app/actions/list.ts", content);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      filePath: "src/app/actions/list.ts",
      functionName: "listProfiles",
    });
    expect(violations[0]?.line).toBeGreaterThan(0);
    expect(violations[0]?.message).toContain("supabase.auth.getUser()");
    expect(violations[0]?.message).toContain("listProfiles");
  });

  it("does not flag when supabase.auth.getUser() is called before the query", () => {
    const content = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function listProfiles() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: { message: "Unauthorized" } };
  }
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id);
  return { data, error };
}
`;

    expect(scanSourceForUseServerSupabaseAuth("src/app/actions/secure.ts", content)).toEqual([]);
  });

  it("flags a function-level use server directive even without a file-level directive", () => {
    const content = `import { createClient } from "@/utils/supabase/server";

export async function insecureRpc() {
  "use server";
  const supabase = await createClient();
  return supabase.rpc("admin_stats");
}
`;

    const violations = scanSourceForUseServerSupabaseAuth("src/lib/actions.ts", content);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.functionName).toBe("insecureRpc");
    expect(violations[0]?.message).toMatch(/\.from\(\) \/ \.rpc\(\)/);
  });

  it("ignores non-server-action helpers that query Supabase", () => {
    const content = `import { createClient } from "@/utils/supabase/server";

async function internalHelper() {
  const supabase = await createClient();
  return supabase.from("profiles").select("id");
}

export async function publicApi() {
  return internalHelper();
}
`;

    expect(scanSourceForUseServerSupabaseAuth("src/lib/helpers.ts", content)).toEqual([]);
  });

  it("ignores auth-only server actions that never call .from / .rpc", () => {
    const content = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function signIn(email: string, password: string) {
  const supabase = await createClient();
  return supabase.auth.signInWithPassword({ email, password });
}
`;

    expect(scanSourceForUseServerSupabaseAuth("src/app/login/actions.ts", content)).toEqual([]);
  });

  it("flags exported const arrow server actions", () => {
    const content = `"use server";

import { createClient } from "@/utils/supabase/server";

export const loadJobs = async () => {
  const supabase = await createClient();
  return await supabase.from("jobs").select("*");
};
`;

    const violations = scanSourceForUseServerSupabaseAuth("src/app/actions/jobs.ts", content);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.functionName).toBe("loadJobs");
  });

  it("does not attribute nested helper DB calls to the outer action when the action itself calls getUser", () => {
    const content = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function outer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: null };

  async function nested() {
    return supabase.from("secrets").select("*");
  }

  return nested();
}
`;

    // Nested is not a server action export; outer calls getUser. No violation.
    expect(scanSourceForUseServerSupabaseAuth("src/app/actions/outer.ts", content)).toEqual([]);
  });

  it("reports the line of the database call, not the function declaration", () => {
    const content = `"use server";

export async function boom() {
  const supabase = await createClient();
  const rows = await supabase
    .from("profiles")
    .select("*");
  return rows;
}
`;

    const violations = scanSourceForUseServerSupabaseAuth("a.ts", content);
    expect(violations).toHaveLength(1);
    // `.from(` is on the line after `await supabase`
    expect(violations[0]?.line).toBe(6);
  });

  it("scanFilesForUseServerSupabaseAuth aggregates across files", () => {
    const violations = scanFilesForUseServerSupabaseAuth([
      {
        filePath: "ok.ts",
        content: `"use server";
export async function ok() {
  const supabase = await createClient();
  await supabase.auth.getUser();
  return supabase.from("profiles").select("*");
}
`,
      },
      {
        filePath: "bad.ts",
        content: `"use server";
export async function bad() {
  const supabase = await createClient();
  return supabase.from("profiles").select("*");
}
`,
      },
    ]);

    expect(violations.map((v) => v.filePath)).toEqual(["bad.ts"]);
  });
});

describe("hasFileLevelUseServer", () => {
  it("detects a leading use server directive", () => {
    const source = ts.createSourceFile(
      "x.ts",
      `"use server";\nexport async function f() {}\n`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    expect(hasFileLevelUseServer(source)).toBe(true);
  });

  it("returns false when the directive is absent", () => {
    const source = ts.createSourceFile(
      "x.ts",
      `export async function f() {}\n`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    expect(hasFileLevelUseServer(source)).toBe(false);
  });
});
