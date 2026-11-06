import { createBrowserSupabaseClient } from "@/lib/supabaseClient";

/**
 * The firewall UI reads the browser session. Scan routes also accept that
 * access token as a Bearer header when the cookie copy is missing or stale.
 */
export async function withBrowserSession(headers?: HeadersInit): Promise<Headers> {
  const next = new Headers(headers);
  const supabase = createBrowserSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  let token = sessionData.session?.access_token ?? null;
  const expiresAt = sessionData.session?.expires_at ?? 0;

  if (token && expiresAt * 1000 < Date.now() + 60_000) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed.session?.access_token ?? token;
  }

  if (token) {
    next.set("Authorization", `Bearer ${token}`);
  }

  return next;
}
