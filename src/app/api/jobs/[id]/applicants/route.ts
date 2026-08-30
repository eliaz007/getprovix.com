import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import { requireApiUser } from "@/lib/api-auth";
import { resolveAccountRole } from "@/lib/account-role";
import { isEmployerRole } from "@/lib/dashboard-account";
import { fetchProfileForCandidateId, fetchProfilesForCandidateIds } from "@/lib/resolve-candidate-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireApiUser(request);
  if (access instanceof NextResponse) {
    return access;
  }

  const { id: jobId } = await context.params;
  if (!UUID_PATTERN.test(jobId)) {
    return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
  }

  const viewerRow =
    (await fetchProfileForCandidateId(access.supabase, access.user.id, "role")) ??
    (await access.supabase
      .from("profiles")
      .select("role")
      .eq("id", access.user.id)
      .maybeSingle()).data;

  const viewerRole = resolveAccountRole(
    typeof viewerRow?.role === "string" ? viewerRow.role : null,
    access.user
  );

  if (!isEmployerRole(viewerRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: job, error: jobError } = await access.supabase
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

  if (!job || job.employer_id !== access.user.id) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const { data: applications, error: applicationsError } = await access.supabase
    .from("job_applications")
    .select("id, candidate_id, created_at, unlocked")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

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

  const reader = createServiceRoleClient() ?? access.supabase;
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
    const { data: matchRows, error: matchError } = await access.supabase
      .from("talent_match_scores")
      .select("candidate_id, match_percentage")
      .eq("employer_id", access.user.id)
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
