import { fetchWithAuth } from "@/lib/fetch-with-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";

export type IncomingJobInterest = {
  id: string;
  jobId: string;
  message: string;
  createdAt: string;
  isRead: boolean;
};

export async function submitCandidateJobInterest(jobId: string): Promise<{
  ok: boolean;
  alreadyApplied: boolean;
}> {
  const response = await fetchWithAuth(
    `/api/jobs/${encodeURIComponent(jobId)}/interest`,
    { method: "POST" }
  );
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    alreadyApplied?: boolean;
    error?: string;
  } | null;

  if (response.status === 409 || payload?.alreadyApplied) {
    return { ok: true, alreadyApplied: true };
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "Could not submit interest.");
  }

  return {
    ok: true,
    alreadyApplied: Boolean(payload.alreadyApplied),
  };
}

export async function fetchIncomingJobInterest(
  supabase: SupabaseClient,
  employerId: string
): Promise<IncomingJobInterest[]> {
  const { data: listings, error: listingsError } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("employer_id", employerId);

  if (listingsError) {
    if (!isSupabaseSchemaError(listingsError)) {
      console.warn("Failed to load employer jobs for interest:", listingsError.message);
    }
    return [];
  }

  const jobs = listings ?? [];
  if (jobs.length === 0) {
    return [];
  }

  const titleById = new Map(
    jobs.map((job) => [job.id, job.title?.trim() || "Open Role"])
  );
  const jobIds = jobs.map((job) => job.id);

  const [{ data: applications, error: applicationsError }, notifications] =
    await Promise.all([
      supabase
        .from("job_applications")
        .select("id, job_id, created_at")
        .in("job_id", jobIds)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("notifications")
        .select("job_id, is_read, created_at")
        .eq("user_id", employerId)
        .order("created_at", { ascending: false })
        .limit(50)
        .then((result) => {
          if (result.error && !isSupabaseSchemaError(result.error)) {
            console.warn(
              "Failed to load interest notification state:",
              result.error.message
            );
          }
          return result.data ?? [];
        }),
    ]);

  if (applicationsError) {
    if (!isSupabaseSchemaError(applicationsError)) {
      console.warn(
        "Failed to load incoming job interest:",
        applicationsError.message
      );
    }
    return [];
  }

  return (applications ?? []).map((row) => {
    const title = titleById.get(row.job_id) ?? "Open Role";
    const appliedAt = new Date(row.created_at).getTime();
    const nearbyNotes = notifications.filter((note) => {
      if (note.job_id !== row.job_id) {
        return false;
      }
      return (
        Math.abs(new Date(note.created_at).getTime() - appliedAt) < 15_000
      );
    });
    const isRead =
      nearbyNotes.length > 0 && nearbyNotes.every((note) => note.is_read);

    return {
      id: row.id,
      jobId: row.job_id,
      message: `A candidate expressed interest in your role: ${title}`,
      createdAt: row.created_at,
      isRead,
    };
  });
}

export async function markJobInterestRead(
  supabase: SupabaseClient,
  employerId: string,
  jobId: string
): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", employerId)
    .eq("job_id", jobId)
    .eq("is_read", false);

  if (error && !isSupabaseSchemaError(error)) {
    console.warn("Failed to mark job interest as read:", error.message);
  }
}

export function subscribeIncomingJobInterest(
  supabase: SupabaseClient,
  employerId: string,
  onChange: () => void
): () => void {
  const channel = supabase
    .channel(`job-interest-${employerId}-${Math.random()}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "job_applications" },
      () => onChange()
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${employerId}`,
      },
      () => onChange()
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
