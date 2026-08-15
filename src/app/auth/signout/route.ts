import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const next = request.nextUrl.searchParams.get("next") ?? "/login";
  const safeNext = next.startsWith("/") ? next : "/login";

  return NextResponse.redirect(new URL(safeNext, request.url), { status: 303 });
}
