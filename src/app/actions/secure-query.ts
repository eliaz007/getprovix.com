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

export async function secureQuery95() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: { message: "Unauthorized" } };
  }
  const { data, error } = await supabase
      .from("profiles")
      .select(
        "full_name, name, first_name, last_name, job_title, headline, bio, skills, experience_level, portfolio_url"
      )
      .eq("id", user.id)
      .maybeSingle();
  return { data, error };
}

export async function secureQuery292(profileSelect: string | undefined): Promise<{ data: any; error: any }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: { message: "Unauthorized", details: "", hint: "", code: "401" } };
  }
  const { data, error } = await supabase
          .from("profiles")
          .select(profileSelect)
          .eq("user_id", user.id)
          .maybeSingle();
  return { data, error };
}
