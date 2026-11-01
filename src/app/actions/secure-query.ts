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

export async function secureQuery281() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: "Unauthorized", details: "", hint: "", code: "401" } };
    }
    const { data, error } = await supabase
        .from("profiles")
        .select("role, is_verified, availability_status, open_to_fulltime, open_to_contract, full_name, company_name, github_verified, github_username, verification_status, production_score, audit_score, audit_breakdown, is_visible_in_pool")
        .eq("id", user.id)
        .maybeSingle();
    return { data, error };
  } catch (error) {
    console.error(error);
    return { data: null, error: { message: "The request could not be completed.", details: "", hint: "", code: "500" } };
  }
}

export async function secureQuery296() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: "Unauthorized", details: "", hint: "", code: "401" } };
    }
    const { data, error } = await supabase
          .from("profiles")
          .select("role, is_verified, availability_status, open_to_fulltime, open_to_contract, full_name, company_name, github_verified, github_username, verification_status, production_score, audit_score, audit_breakdown, is_visible_in_pool")
          .eq("user_id", user.id)
          .maybeSingle();
    return { data, error };
  } catch (error) {
    console.error(error);
    return { data: null, error: { message: "The request could not be completed.", details: "", hint: "", code: "500" } };
  }
}

export async function secureQuery302() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: "Unauthorized", details: "", hint: "", code: "401" } };
    }
    const { data, error } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();
    return { data, error };
  } catch (error) {
    console.error(error);
    return { data: null, error: { message: "The request could not be completed.", details: "", hint: "", code: "500" } };
  }
}

export async function secureQuery305() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: "Unauthorized", details: "", hint: "", code: "401" } };
    }
    const { data, error } = await supabase
              .from("profiles")
              .select("role")
              .eq("user_id", user.id)
              .maybeSingle();
    return { data, error };
  } catch (error) {
    console.error(error);
    return { data: null, error: { message: "The request could not be completed.", details: "", hint: "", code: "500" } };
  }
}
