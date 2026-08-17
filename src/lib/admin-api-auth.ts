import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import {
  createServiceRoleClient,
  isAdminUser,
} from "@/lib/admin-access";
import { createClient } from "@/utils/supabase/server";

type AdminApiAccess = {
  user: User;
  dataClient: SupabaseClient;
};

export async function requireAdminApiAccess(): Promise<
  AdminApiAccess | NextResponse
> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminUser(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceClient = createServiceRoleClient();
  const dataClient = serviceClient ?? authClient;

  return { user, dataClient };
}

export function parseIntroRequestId(body: {
  id?: string;
  requestId?: string;
  introId?: string;
}): string {
  return (body.requestId || body.id || body.introId || "").trim();
}
