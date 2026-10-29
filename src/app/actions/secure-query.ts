"use server";

import { createClient } from "@/utils/supabase/server";

export async function secureQuery184() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: { message: "Unauthorized" } };
  }
  const { data, error } = await supabase
          .from("profiles")
          .select("github_verified")
          .or(`id.eq.${user.id},user_id.eq.${user.id}`)
          .limit(1)
          .maybeSingle();
  return { data, error };
}
