import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_SESSION_TIMEOUT_MS } from "@/lib/auth-session-timeout";

export { AUTH_SESSION_TIMEOUT_MS };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const cookieOptions = {
  path: "/",
  sameSite: "lax" as const,
};

/**
 * v2.112+ is lockless by default. Do not pass `auth.lock` — that opts into the
 * legacy path that wraps every auth call in navigator.locks / BroadcastChannel
 * and can freeze mobile tabs until the app is backgrounded.
 */
let browserClient: SupabaseClient | undefined;

export function createBrowserSupabaseClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      cookieOptions,
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: {
        fetch: (url, options = {}) =>
          fetch(url, { ...options, cache: "no-store" }),
      },
    });
  }

  return browserClient;
}

export async function readBrowserSession(
  client: SupabaseClient,
  timeoutMs = AUTH_SESSION_TIMEOUT_MS
) {
  return Promise.race([
    client.auth.getSession(),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("supabase getSession timed out"));
      }, timeoutMs);
    }),
  ]);
}

export const supabase = createBrowserSupabaseClient();
