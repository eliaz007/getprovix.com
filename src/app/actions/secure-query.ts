"use server";

import { createClient } from "@/utils/supabase/server";

export async function secureQuery184() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: { message: "Unauthorized", details: "", hint: "", code: "401" } };
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
    return { data: null, error: { message: "Unauthorized", details: "", hint: "", code: "401" } };
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

export async function secureQuery284(userId: string | undefined) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: "Unauthorized", details: "", hint: "", code: "401" } };
    }
    const { data, error } = await supabase
    .from("repo_verifications")
    .select("repo_url")
    .eq("user_id", userId == null ? undefined : String(userId))
    .is("is_verified", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
    return { data, error };
  } catch (error) {
    console.error(error);
    return { data: null, error: { message: "The request could not be completed.", details: "", hint: "", code: "500" } };
  }
}

export async function secureQuery145(owned: ReadonlyArray<{ id: string }> | undefined) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: "Unauthorized", details: "", hint: "", code: "401" } as never };
    }
    const { data, error } = await supabase
        .from("job_applications")
        .select("job_id")
        .in("job_id", (owned ?? []).map((job) => job.id)
        );
    return { data, error };
  } catch (error) {
    console.error(error);
    return { data: null, error: { message: "The request could not be completed.", details: "", hint: "", code: "500" } as never };
  }
}

export async function secureQuery339(dbPayload: Record<string, unknown>) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: "Unauthorized", details: "", hint: "", code: "401" } as never };
    }
    const { data, error } = await supabase
        .from("jobs")
        .insert(dbPayload as never)
        .select("*")
        .single();
    return { data, error };
  } catch (error) {
    console.error(error);
    return { data: null, error: { message: "The request could not be completed.", details: "", hint: "", code: "500" } as never };
  }
}

export async function secureQuery257(screeningKey: string | undefined) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: "Unauthorized", details: "", hint: "", code: "401" } as never };
    }
    const { data, error } = await supabase
          .from("candidate_screenings")
          .select("id, audit_data, integrity_score")
          .eq("candidate_key", screeningKey == null ? undefined : String(screeningKey))
          .maybeSingle();
    return { data, error };
  } catch (error) {
    console.error(error);
    return { data: null, error: { message: "The request could not be completed.", details: "", hint: "", code: "500" } as never };
  }
}

export async function secureQuery417(employerId: string | undefined, jobId: string | undefined, candidateIds: readonly string[] | undefined) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: "Unauthorized", details: "", hint: "", code: "401" } as never };
    }
    const { data, error } = await supabase
            .from("talent_match_scores")
            .select("candidate_id, match_percentage")
            .eq("employer_id", employerId == null ? undefined : String(employerId))
            .eq("job_id", jobId == null ? undefined : String(jobId))
            .in("candidate_id", candidateIds ?? []);
    return { data, error };
  } catch (error) {
    console.error(error);
    return { data: null, error: { message: "The request could not be completed.", details: "", hint: "", code: "500" } as never };
  }
}
