/**
 * Intentional Next.js App Router + Supabase flaws for AST scanner golden tests.
 *
 * Source texts are scanned under virtual App Router paths. The service-role JWT
 * is assembled at runtime so this module file itself does not contain a contiguous
 * JWT literal that would trip SECRET_LEAK when the fixtures tree is scanned.
 */

import { INSECURE_AUTH_SESSION_RULE } from "@/lib/scanner/get-session-auth";
import { USE_SERVER_SUPABASE_AUTH_RULE } from "@/lib/scanner/use-server-supabase-auth";
import type { AstFixtureCase } from "@/lib/scanner/__fixtures__/types";

/** Synthetic Supabase service-role JWT shape matching SECRET_RULES. */
export const FIXTURE_SERVICE_ROLE_JWT = [
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  "eyJyb2xlIjoic2VydmljZV9yb2xlIn0",
  "fixture_service_role_sig",
].join(".");

/**
 * Server Action that trusts `getSession()` instead of `getUser()`.
 * Expected: Insecure getSession Auth @ line of `.getSession(`.
 */
const GET_SESSION_SERVER_ACTION = `"use server";

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

/**
 * App Router Route Handler that trusts `getSession()`.
 * Expected: Insecure getSession Auth @ line of `.getSession(`.
 */
const GET_SESSION_ROUTE_HANDLER = `import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ userId: session.user.id });
}
`;

/**
 * Hardcoded Supabase service-role key in application source.
 * Expected: Hardcoded Secret @ the JWT line.
 * Kept as a plain export so the env-var autofix typechecks under strict TS
 * (passing `process.env.*` straight into `createClient` is `string | undefined`).
 */
const HARDCODED_SERVICE_ROLE = `export const supabaseServiceRoleKey = "${FIXTURE_SERVICE_ROLE_JWT}";
`;

/**
 * `"use server"` mutation with no `auth.getUser()` guard.
 * Expected: Unauthenticated Server Action DB Access @ `.from(` line.
 */
const UNAUTHENTICATED_DB_MUTATION = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function deleteProfile(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").delete().eq("id", id);
  return { data, error };
}
`;

/**
 * `"use server"` RPC without auth — second unauthenticated DB pattern.
 * Expected: Unauthenticated Server Action DB Access @ `.rpc(` line.
 */
const UNAUTHENTICATED_RPC = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function runAdminStats() {
  const supabase = await createClient();
  return supabase.rpc("admin_stats");
}
`;

export const VULNERABLE_FIXTURES: readonly AstFixtureCase[] = [
  {
    id: "get-session-server-action",
    virtualPath: "src/app/actions/profile.ts",
    content: GET_SESSION_SERVER_ACTION,
    expected: [{ ruleId: INSECURE_AUTH_SESSION_RULE, line: 9 }],
  },
  {
    id: "get-session-route-handler",
    virtualPath: "src/app/api/profile/route.ts",
    content: GET_SESSION_ROUTE_HANDLER,
    expected: [{ ruleId: INSECURE_AUTH_SESSION_RULE, line: 8 }],
  },
  {
    id: "hardcoded-service-role-key",
    virtualPath: "src/lib/supabase-admin.ts",
    content: HARDCODED_SERVICE_ROLE,
    expected: [{ ruleId: "Hardcoded Secret", line: 1 }],
  },
  {
    id: "unauthenticated-db-mutation",
    virtualPath: "src/app/actions/delete-profile.ts",
    content: UNAUTHENTICATED_DB_MUTATION,
    expected: [{ ruleId: USE_SERVER_SUPABASE_AUTH_RULE, line: 7 }],
  },
  {
    id: "unauthenticated-rpc",
    virtualPath: "src/app/actions/admin-stats.ts",
    content: UNAUTHENTICATED_RPC,
    expected: [{ ruleId: USE_SERVER_SUPABASE_AUTH_RULE, line: 7 }],
  },
] as const;

/** Flat file list for `runSecuritySuiteScan` / multi-file aggregation tests. */
export const VULNERABLE_SCAN_FILES = VULNERABLE_FIXTURES.map((fixture) => ({
  filePath: fixture.virtualPath,
  content: fixture.content,
}));
