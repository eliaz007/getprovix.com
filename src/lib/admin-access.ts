import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

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
  if (process.env.NODE_ENV === "development") {
    return true;
  }

  if (!user?.email) {
    return false;
  }

  return (
    user.email === "comradeduck1@gmail.com" ||
    user.email === "eliasdiangelo91@gmail.com"
  );
}
