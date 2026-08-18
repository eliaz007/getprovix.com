import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

export const ADMIN_EMAILS = [
  "eliasdiangelo91@gmail.com",
  "eliasdiangelo@gmail.com",
  "comradeduck1@gmail.com",
] as const;

export function isAdminUser(user: User | null | undefined): boolean {
  if (!user?.email) {
    return false;
  }

  return (
    ADMIN_EMAILS.includes(user.email as (typeof ADMIN_EMAILS)[number]) ||
    user.user_metadata?.role === "admin"
  );
}

export function getPostLoginPath(user: User | null | undefined): "/" | "/admin" {
  return isAdminUser(user) ? "/admin" : "/";
}

export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function isAllowedAdminUser(user: User | null | undefined): boolean {
  return isAdminUser(user);
}
