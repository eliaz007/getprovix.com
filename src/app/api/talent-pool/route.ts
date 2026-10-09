import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import { requireApiUser } from "@/lib/api-auth";
import { fetchEmployerTalentPoolProfiles } from "@/lib/talent-pool-profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Any authenticated user may browse published talent-pool profiles.
  // Prefer the service-role client so directory reads are not blocked when the
  // viewer's profiles.role is candidate/admin (RLS employer-only legacy).
  const access = await requireApiUser(request);
  if (access instanceof NextResponse) {
    return access;
  }

  const reader = createServiceRoleClient() ?? access.supabase;
  const { data, error } = await fetchEmployerTalentPoolProfiles(reader);

  if (error) {
    console.error("[talent-pool] fetch failed:", error);
    return NextResponse.json(
      { error: "Could not load talent pool." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { profiles: data },
    { headers: { "Cache-Control": "no-store" } }
  );
}
