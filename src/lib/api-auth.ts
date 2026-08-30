import { NextResponse } from "next/server";
import { createClient as createJwtClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { consumeRateLimit, tooManyRequestsResponse } from "@/lib/ip-rate-limit";
import { createClient } from "@/utils/supabase/server";

const AUTHENTICATED_AI_LIMIT = 30;
const AUTHENTICATED_AI_WINDOW_MS = 60_000;

export type ApiUserAccess = {
  user: User;
  supabase: SupabaseClient;
};

function readBearerToken(request?: Request): string | null {
  const header = request?.headers.get("authorization")?.trim();
  if (!header) {
    return null;
  }

  const match = /^Bearer\s+(\S+)/i.exec(header);
  return match?.[1] ?? null;
}

function createAccessTokenClient(accessToken: string): SupabaseClient {
  return createJwtClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

export async function requireApiUser(
  request?: Request
): Promise<ApiUserAccess | NextResponse> {
  const cookieClient = await createClient();
  const {
    data: { user },
  } = await cookieClient.auth.getUser();

  if (user) {
    return { user, supabase: cookieClient };
  }

  const accessToken = readBearerToken(request);
  if (accessToken) {
    const tokenClient = createAccessTokenClient(accessToken);
    const {
      data: { user: tokenUser },
      error: tokenError,
    } = await tokenClient.auth.getUser(accessToken);

    if (tokenUser && !tokenError) {
      return { user: tokenUser, supabase: tokenClient };
    }
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function requireAiApiUser(): Promise<ApiUserAccess | NextResponse> {
  const access = await requireApiUser();
  if (access instanceof NextResponse) {
    return access;
  }

  const limited = consumeRateLimit(
    `ai:${access.user.id}`,
    AUTHENTICATED_AI_LIMIT,
    AUTHENTICATED_AI_WINDOW_MS
  );

  if (!limited.ok) {
    return tooManyRequestsResponse(limited.retryAfterSec);
  }

  return access;
}

export async function requireAiApiAccess(): Promise<NextResponse | null> {
  const access = await requireAiApiUser();
  if (access instanceof NextResponse) {
    return access;
  }

  return null;
}
