import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { consumeRateLimit, tooManyRequestsResponse } from "@/lib/ip-rate-limit";
import { createClient } from "@/utils/supabase/server";

const AUTHENTICATED_AI_LIMIT = 30;
const AUTHENTICATED_AI_WINDOW_MS = 60_000;

export type ApiUserAccess = {
  user: User;
  supabase: SupabaseClient;
};

export async function requireApiUser(): Promise<ApiUserAccess | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { user, supabase };
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
