import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import { requireVerifiedEmployer } from "@/lib/api-auth";
import {
  employerIdentityIds,
  fetchProfileForCandidateId,
  fetchProfilesForCandidateIds,
} from "@/lib/resolve-candidate-profile";
import { isSupabaseSchemaError, schemaErrorMentionsColumn } from "@/lib/supabase-schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireVerifiedEmployer(request);
  if (access instanceof NextResponse) {
    return access;
  }

  const { id: jobId } = await context.params;
  if (!UUID_PATTERN.test(jobId)) {
    return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
  }

  const reader = createServiceRoleClient() ?? access.supabase;
  const viewerRow = await fetchProfileForCandidateId(
    reader,
    access.user.id,
    "id, user_id, role"
  );
  const employerIds = employerIdentityIds(access.user.id, viewerRow);

  const { data: job, error: jobError } = await reader
    .from("jobs")
    .select("id, employer_id")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) {
    console.error("[job applicants] job lookup failed:", jobError.message);
    return NextResponse.json(
      { error: "Could not load job applicants." },
      { status: 500 }
    );
  }

  if (!job || !employerIds.includes(job.employer_id)) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  let applications: Array<{
    id: string;
    candidate_id: string;
    created_at: string;
    unlocked?: boolean | null;
  }> | null = null;
  let applicationsError: { message: string } | null = null;

  {
    const first = await reader
      .from("job_applications")
      .select("id, candidate_id, created_at, unlocked")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    applications = first.data ?? null;
    applicationsError = first.error;

    if (
      applicationsError &&
      isSupabaseSchemaError(applicationsError) &&
      schemaErrorMentionsColumn(applicationsError, "unlocked")
    ) {
      const fallback = await reader
        .from("job_applications")
        .select("id, candidate_id, created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      applications = fallback.data ?? [];
      applicationsError = fallback.error;
    }
  }

  if (applicationsError) {
    console.error(
      "[job applicants] applications lookup failed:",
      applicationsError.message
    );
    return NextResponse.json(
      { error: "Could not load job applicants." },
      { status: 500 }
    );
  }

  const rows = applications ?? [];
  const candidateIds = rows
    .map((row) => row.candidate_id)
    .filter((value): value is string => typeof value === "string");

  const profilesByRef = await fetchProfilesForCandidateIds(reader, candidateIds);

  const profiles: Record<string, Record<string, unknown>> = {};
  for (const candidateId of candidateIds) {
    const row = profilesByRef.get(candidateId);
    if (row) {
      profiles[candidateId] = row;
    }
  }

  const matches: Record<string, number> = {};
  if (candidateIds.length > 0) {
    const { data: matchRows, error: matchError } = await reader
      .from("talent_match_scores")
      .select("candidate_id, match_percentage")
      .in("employer_id", employerIds)
      .eq("job_id", jobId)
      .in("candidate_id", candidateIds);

    if (matchError) {
      console.error(
        "[job applicants] match scores lookup failed:",
        matchError.message
      );
    } else {
      for (const matchRow of matchRows ?? []) {
        if (
          matchRow.candidate_id &&
          typeof matchRow.match_percentage === "number"
        ) {
          matches[matchRow.candidate_id] = matchRow.match_percentage;
        }
      }
    }
  }

  return NextResponse.json(
    {
      applications: rows,
      profiles,
      matches,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
