import { createClient } from "@/utils/supabase/client";

export async function fetchWithAuth(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  try {
    const supabase = createClient();
    let session: { access_token?: string } | null = null;

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      const sessionResult = await supabase.auth.getSession();
      session = sessionResult.data.session;

      if (userError || !user || !session?.access_token) {
        const refreshed = await supabase.auth.refreshSession();
        session = refreshed.data.session;
      }
    } catch (error) {
      console.error("[fetch-with-auth] session lookup failed:", error);
    }

    const headers = new Headers(init.headers);
    if (session?.access_token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }

    return await fetch(input, {
      ...init,
      credentials: init.credentials ?? "include",
      cache: init.cache ?? "no-store",
      headers,
    });
  } catch (error) {
    console.error("[fetch-with-auth] request failed:", error);
    throw error instanceof Error
      ? error
      : new Error("Authenticated fetch failed.");
  }
}
