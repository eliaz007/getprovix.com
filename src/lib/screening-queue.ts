import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScreeningQueueStatus } from "@/lib/talent-pool-candidate";

const SCHEMA_MISSING = new Set(["42P01", "42703", "PGRST205", "PGRST204"]);

export type ScreeningJobInput = {
  candidate: Record<string, unknown>;
  job: Record<string, unknown>;
  profileId: string | null;
};

export type EnqueuedScreening = {
  id: string;
  candidateKey: string;
  runId: string;
};

type QueueError = { code?: string; message?: string } | null;

function isSchemaMiss(error: QueueError): boolean {
  return Boolean(error?.code && SCHEMA_MISSING.has(error.code));
}

function pendingAudit(
  runId: string,
  input: ScreeningJobInput,
  status: ScreeningQueueStatus
): Record<string, unknown> {
  return {
    status,
    run_id: runId,
    requested_at: new Date().toISOString(),
    job_input: input,
  };
}

async function writeRow(
  supabase: SupabaseClient,
  id: string,
  userId: string,
  values: Record<string, unknown>
): Promise<{ error: QueueError; missingStatusColumn: boolean }> {
  const { error } = await supabase
    .from("candidate_screenings")
    .update(values)
    .eq("id", id)
    .eq("created_by", userId);

  if (error && error.code === "42703" && "status" in values) {
    const { status: _status, ...withoutStatus } = values;
    const retry = await supabase
      .from("candidate_screenings")
      .update(withoutStatus)
      .eq("id", id)
      .eq("created_by", userId);
    return { error: retry.error, missingStatusColumn: true };
  }

  return { error, missingStatusColumn: false };
}

export async function enqueuePendingScreening(
  supabase: SupabaseClient,
  args: {
    userId: string;
    candidateKey: string;
    profileId: string | null;
    input: ScreeningJobInput;
  }
): Promise<
  | { ok: true; row: EnqueuedScreening }
  | { ok: false; unavailable: boolean; error: string }
> {
  const candidateKey = args.candidateKey.trim();
  const runId = crypto.randomUUID();
  const auditData = pendingAudit(runId, args.input, "pending");
  const values = {
    candidate_key: candidateKey,
    created_by: args.userId,
    profile_id: args.profileId,
    integrity_score: null,
    status: "pending" satisfies ScreeningQueueStatus,
    audit_data: auditData,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: lookupError } = await supabase
    .from("candidate_screenings")
    .select("id")
    .eq("created_by", args.userId)
    .eq("candidate_key", candidateKey)
    .maybeSingle();

  if (isSchemaMiss(lookupError)) {
    return {
      ok: false,
      unavailable: true,
      error: lookupError?.message ?? "candidate_screenings is unavailable.",
    };
  }

  if (lookupError) {
    return {
      ok: false,
      unavailable: false,
      error: lookupError.message,
    };
  }

  if (existing?.id) {
    const written = await writeRow(supabase, existing.id, args.userId, values);
    if (written.error) {
      return {
        ok: false,
        unavailable: isSchemaMiss(written.error),
        error: written.error.message ?? "Could not queue screening.",
      };
    }

    return {
      ok: true,
      row: { id: existing.id, candidateKey, runId },
    };
  }

  const inserted = await supabase
    .from("candidate_screenings")
    .insert(values)
    .select("id")
    .maybeSingle();

  if (inserted.error?.code === "42703") {
    const { status: _status, ...withoutStatus } = values;
    const retry = await supabase
      .from("candidate_screenings")
      .insert(withoutStatus)
      .select("id")
      .maybeSingle();

    if (retry.error || !retry.data?.id) {
      return {
        ok: false,
        unavailable: isSchemaMiss(retry.error),
        error: retry.error?.message ?? "Could not queue screening.",
      };
    }

    return {
      ok: true,
      row: { id: retry.data.id, candidateKey, runId },
    };
  }

  if (inserted.error || !inserted.data?.id) {
    return {
      ok: false,
      unavailable: isSchemaMiss(inserted.error),
      error: inserted.error?.message ?? "Could not queue screening.",
    };
  }

  return {
    ok: true,
    row: { id: inserted.data.id, candidateKey, runId },
  };
}

export async function readQueuedRunId(
  supabase: SupabaseClient,
  screeningId: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("candidate_screenings")
    .select("audit_data")
    .eq("id", screeningId)
    .eq("created_by", userId)
    .maybeSingle();

  if (error || !data?.audit_data || typeof data.audit_data !== "object") {
    return null;
  }

  const runId = (data.audit_data as { run_id?: unknown }).run_id;
  return typeof runId === "string" ? runId : null;
}

export async function markScreeningProcessing(
  supabase: SupabaseClient,
  args: {
    screeningId: string;
    userId: string;
    runId: string;
    input: ScreeningJobInput;
  }
): Promise<boolean> {
  const current = await readQueuedRunId(supabase, args.screeningId, args.userId);
  if (current && current !== args.runId) {
    return false;
  }

  const written = await writeRow(supabase, args.screeningId, args.userId, {
    status: "processing",
    audit_data: pendingAudit(args.runId, args.input, "processing"),
    updated_at: new Date().toISOString(),
  });

  return !written.error;
}

export async function completeScreeningRun(
  supabase: SupabaseClient,
  args: {
    screeningId: string;
    userId: string;
    runId: string;
    profileId: string | null;
    integrityScore: number;
    auditData: Record<string, unknown>;
  }
): Promise<boolean> {
  const current = await readQueuedRunId(supabase, args.screeningId, args.userId);
  if (current && current !== args.runId) {
    return false;
  }

  const written = await writeRow(supabase, args.screeningId, args.userId, {
    status: "completed",
    profile_id: args.profileId,
    integrity_score: args.integrityScore,
    audit_data: args.auditData,
    updated_at: new Date().toISOString(),
  });

  return !written.error;
}

export async function failScreeningRun(
  supabase: SupabaseClient,
  args: {
    screeningId: string;
    userId: string;
    runId: string;
    error: string;
    input: ScreeningJobInput;
  }
): Promise<void> {
  const current = await readQueuedRunId(supabase, args.screeningId, args.userId);
  if (current && current !== args.runId) {
    return;
  }

  await writeRow(supabase, args.screeningId, args.userId, {
    status: "failed",
    integrity_score: null,
    audit_data: {
      status: "failed",
      run_id: args.runId,
      error: args.error,
      job_input: args.input,
    },
    updated_at: new Date().toISOString(),
  });
}
