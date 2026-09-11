import { createClient } from "@/utils/supabase/client";

export async function fetchWithAuth(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (userError || !user || !session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }

  const headers = new Headers(init.headers);
  if (session?.access_token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(input, {
    ...init,
    credentials: init.credentials ?? "include",
    cache: init.cache ?? "no-store",
    headers,
  });
}
