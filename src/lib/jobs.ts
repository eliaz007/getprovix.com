import type { SupabaseClient } from "@supabase/supabase-js";

export type JobRow = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  salary_range: string | null;
  tags: string[] | null;
  employer_id: string;
  status: string | null;
  created_at?: string | null;
  description?: string | null;
};

export const JOB_FEED_COLUMNS =
  "id, title, company, location, salary_range, tags, employer_id, status, created_at";

export async function fetchPublicJobFeed(supabase: SupabaseClient): Promise<{
  data: JobRow[];
  error: { message: string; details?: string | null; hint?: string | null } | null;
}> {
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_FEED_COLUMNS)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error };
  }

  return { data: (data ?? []) as JobRow[], error: null };
}

export async function fetchDashboardJobs(supabase: SupabaseClient): Promise<{
  data: JobRow[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_FEED_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error };
  }

  return { data: (data ?? []) as JobRow[], error: null };
}
