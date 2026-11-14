import { describe, expect, it } from "vitest";
import {
  findGetSessionOccurrences,
  isServerSideAuthFile,
  rewriteGetSessionToGetUser,
} from "@/lib/scanner/get-session-auth";
import { planSecurityFix, runSecuritySuiteScan } from "@/lib/scanner/security-suite";
import { finalizeAutofixWrites } from "@/lib/autofix-write-validation";

const SERVER_ACTION = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function loadProfile() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { data: null, error: { message: "Unauthorized" } };
  }
  return { data: { id: session.user.id }, error: null };
}
`;

describe("isServerSideAuthFile", () => {
  it("treats use server, route handlers, and server client imports as server-side", () => {
    expect(isServerSideAuthFile("src/app/actions/x.ts", `"use server";\n`)).toBe(true);
    expect(isServerSideAuthFile("src/app/api/foo/route.ts", `export async function GET() {}`)).toBe(
      true
    );
    expect(
      isServerSideAuthFile(
        "src/lib/thing.ts",
        `import { createClient } from "@/utils/supabase/server";\n`
      )
    ).toBe(true);
    expect(isServerSideAuthFile("src/middleware.ts", `export function middleware() {}`)).toBe(true);
  });

  it("skips pure client components", () => {
    expect(
      isServerSideAuthFile(
        "src/components/panel.tsx",
        `"use client";\nawait supabase.auth.getSession();\n`
      )
    ).toBe(false);
  });
});

describe("findGetSessionOccurrences / rewriteGetSessionToGetUser", () => {
  it("detects getSession in a server action and rewrites destructuring + session.user", () => {
    const hits = findGetSessionOccurrences("src/app/actions/profile.ts", SERVER_ACTION);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.autofixable).toBe(true);
    expect(hits[0]?.sessionBinding).toBe("session");

    const rewritten = rewriteGetSessionToGetUser(
      SERVER_ACTION,
      "src/app/actions/profile.ts",
      hits[0]?.line
    );
    expect(rewritten?.changed).toBe(true);
    expect(rewritten?.content).toContain("supabase.auth.getUser()");
    expect(rewritten?.content).not.toContain("getSession");
    expect(rewritten?.content).toContain("data: { user }");
    expect(rewritten?.content).toContain("if (!user)");
    expect(rewritten?.content).toContain("user.id");
    expect(rewritten?.content).not.toMatch(/session\.user/);
  });

  it("does not flag client-side getSession", () => {
    const content = `"use client";
import { createClient } from "@/utils/supabase/client";
export async function read() {
  const supabase = createClient();
  return supabase.auth.getSession();
}
`;
    expect(findGetSessionOccurrences("src/components/x.tsx", content)).toEqual([]);
  });

  it("marks session.access_token usage as not autofixable", () => {
    const content = `"use server";
export async function token() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}
`;
    const hits = findGetSessionOccurrences("src/app/actions/token.ts", content);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.autofixable).toBe(false);
    expect(rewriteGetSessionToGetUser(content, "src/app/actions/token.ts", hits[0]?.line)).toBeNull();
  });

  it("rewrites chained .data.session access", () => {
    const content = `"use server";
export async function load() {
  const supabase = await createClient();
  const session = (await supabase.auth.getSession()).data.session;
  return session;
}
`;
    const rewritten = rewriteGetSessionToGetUser(content, "src/app/actions/load.ts");
    expect(rewritten?.content).toContain("getUser()");
    expect(rewritten?.content).toContain(".data.user");
    expect(rewritten?.content).not.toContain("getSession");
    expect(rewritten?.content).not.toContain(".data.session");
  });
});

describe("security-suite INSECURE_AUTH_SESSION integration", () => {
  it("emits a finding and plans a surgical rewrite", () => {
    const filePath = "src/app/actions/profile.ts";
    const findings = runSecuritySuiteScan([{ filePath, content: SERVER_ACTION }]).filter(
      (item) => item.category === "INSECURE_AUTH_SESSION"
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("Insecure getSession Auth");
    expect(findings[0]?.message).toMatch(/getUser\(\)/);

    const plan = planSecurityFix(
      { filePath, content: SERVER_ACTION },
      "INSECURE_AUTH_SESSION",
      findings[0]!.line
    );
    expect(plan).not.toBeNull();
    expect(plan?.writes).toHaveLength(1);
    expect(plan?.writes[0]?.content).toContain("getUser()");
    expect(plan?.writes[0]?.content).toContain("data: { user }");
    expect(plan?.branchSlug).toBe("get-user");
  });

  it("passes TypeScript preflight after the rewrite", async () => {
    const filePath = "src/app/actions/profile.ts";
    const findings = runSecuritySuiteScan([{ filePath, content: SERVER_ACTION }]).filter(
      (item) => item.category === "INSECURE_AUTH_SESSION"
    );
    const plan = planSecurityFix(
      { filePath, content: SERVER_ACTION },
      "INSECURE_AUTH_SESSION",
      findings[0]!.line
    );
    expect(plan).not.toBeNull();

    const helper = `export async function createClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "1" } }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  };
}
`;
    const finalized = await finalizeAutofixWrites([
      ...(plan?.writes ?? []),
      { filePath: "src/utils/supabase/server.ts", content: helper },
    ]);
    expect(finalized.ok).toBe(true);
  }, 60_000);
});
