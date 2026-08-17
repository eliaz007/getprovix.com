import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith("sb-") || name.includes("supabase");
}

export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();

    const cookieStore = await cookies();
    for (const cookie of cookieStore.getAll()) {
      if (isSupabaseAuthCookie(cookie.name)) {
        cookieStore.delete(cookie.name);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API auth sign out error:", error);
    return NextResponse.json({ error: "Failed to sign out" }, { status: 500 });
  }
}
