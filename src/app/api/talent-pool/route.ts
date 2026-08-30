import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import { requireVerifiedEmployer } from "@/lib/api-auth";
import { fetchEmployerTalentPoolProfiles } from "@/lib/talent-pool-profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireVerifiedEmployer(request);
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
