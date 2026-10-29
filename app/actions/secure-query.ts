"use server";

import { createClient } from "@/utils/supabase/server";

export async function secureQuery95() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, message: "Unauthorized" };
  }
  return supabase
      .from("profiles")
      .select;
}
