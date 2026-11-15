/**
 * Secure counterparts to `vulnerable-patterns.ts`.
 * Fed through the same AST scanners to assert zero false positives.
 */

import type { AstFixtureCase } from "@/lib/scanner/__fixtures__/types";

/**
 * Server Action using `getUser()` + auth guard before returning user data.
 */
const GET_USER_SERVER_ACTION = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function loadProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: { message: "Unauthorized" } };
  }
  return { data: { id: user.id }, error: null };
}
`;

/**
 * Route Handler using `getUser()` instead of `getSession()`.
 */
const GET_USER_ROUTE_HANDLER = `import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ userId: user.id });
}
`;

/**
 * Service-role credential read from the environment (no hardcoded JWT).
 */
const ENV_SERVICE_ROLE = `export const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
`;

/**
 * Server Action mutation gated by `getUser()` before `.from()`.
 */
const AUTHENTICATED_DB_MUTATION = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function deleteProfile(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: { message: "Unauthorized" } };
  }
  const { data, error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);
  return { data, error };
}
`;

/**
 * Server Action RPC gated by `getUser()`.
 */
const AUTHENTICATED_RPC = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function runAdminStats() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: { message: "Unauthorized" } };
  }
  return supabase.rpc("admin_stats");
}
`;

export const COMPLIANT_FIXTURES: readonly AstFixtureCase[] = [
  {
    id: "get-user-server-action",
    virtualPath: "src/app/actions/profile.ts",
    content: GET_USER_SERVER_ACTION,
    expected: [],
  },
  {
    id: "get-user-route-handler",
    virtualPath: "src/app/api/profile/route.ts",
    content: GET_USER_ROUTE_HANDLER,
    expected: [],
  },
  {
    id: "env-service-role-key",
    virtualPath: "src/lib/supabase-admin.ts",
    content: ENV_SERVICE_ROLE,
    expected: [],
  },
  {
    id: "authenticated-db-mutation",
    virtualPath: "src/app/actions/delete-profile.ts",
    content: AUTHENTICATED_DB_MUTATION,
    expected: [],
  },
  {
    id: "authenticated-rpc",
    virtualPath: "src/app/actions/admin-stats.ts",
    content: AUTHENTICATED_RPC,
    expected: [],
  },
] as const;

export const COMPLIANT_SCAN_FILES = COMPLIANT_FIXTURES.map((fixture) => ({
  filePath: fixture.virtualPath,
  content: fixture.content,
}));
