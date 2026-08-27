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

export async function fetchPublicJobFeed(): Promise<{
  data: JobRow[];
  error: { message: string } | null;
}> {
  try {
    const response = await fetch("/api/jobs/feed");
    if (!response.ok) {
      return { data: [], error: { message: "Could not load job feed." } };
    }

    const payload = (await response.json()) as { jobs?: JobRow[] };
    return { data: payload.jobs ?? [], error: null };
  } catch {
    return { data: [], error: { message: "Could not load job feed." } };
  }
}

export async function fetchDashboardJobs(supabase: SupabaseClient): Promise<{
  data: JobRow[];
  error: { message: string } | null;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fetchPublicJobFeed();
  }

  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: { message: error.message } };
  }

  return { data: (data ?? []) as JobRow[], error: null };
}
