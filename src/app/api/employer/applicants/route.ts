import { NextResponse } from "next/server";
import { resolveAccountRole } from "@/lib/account-role";
import { createServiceRoleClient } from "@/lib/admin-access";
import { requireApiUser } from "@/lib/api-auth";
import { isEmployerRole } from "@/lib/dashboard-account";
import {
  APPLICANT_PROFILE_COLUMNS,
  mapEmployerApplicant,
  type ApplicantProfileRow,
  type EmployerApplicantsPayload,
} from "@/lib/job-applicants";
import { parseJobListInput } from "@/lib/jobs";
import type { MatchResult } from "@/lib/match-heuristic";
import {
  employerIdentityIds,
  fetchProfileForCandidateId,
  fetchProfilesForCandidateIds,
} from "@/lib/resolve-candidate-profile";
import { isSupabaseSchemaError, schemaErrorMentionsColumn } from "@/lib/supabase-schema-errors";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_APPLICATIONS = 80;

type ApplicationRow = {
  id: string;
  job_id: string;
  candidate_id: string;
  created_at: string;
  unlocked?: boolean | null;
  review_status?: string | null;
};

type JobRow = {
  id: string;
  title: string | null;
  status: string | null;
  tags?: string[] | null;
  tech_stack?: string[] | null;
  required_skills?: string[] | null;
};

function matchKey(jobId: string, candidateId: string): string {
  return `${jobId}:${candidateId}`;
}

async function fetchEmployerJobs(
  client: SupabaseClient,
  employerIds: string[]
): Promise<{ jobs: JobRow[]; error: { message: string } | null }> {
  const first = await client
    .from("jobs")
    .select("id, title, status, tags, tech_stack, required_skills, created_at")
    .in("employer_id", employerIds)
    .order("created_at", { ascending: false });

  if (
    first.error &&
    isSupabaseSchemaError(first.error) &&
    (schemaErrorMentionsColumn(first.error, "tech_stack") ||
      schemaErrorMentionsColumn(first.error, "required_skills"))
  ) {
    const fallback = await client
      .from("jobs")
      .select("id, title, status, tags, created_at")
      .in("employer_id", employerIds)
      .order("created_at", { ascending: false });
    return {
      jobs: (fallback.data ?? []) as JobRow[],
      error: fallback.error,
    };
  }

  return {
    jobs: (first.data ?? []) as JobRow[],
    error: first.error,
  };
}

async function fetchJobApplications(
  client: SupabaseClient,
  jobIds: string[]
): Promise<{ rows: ApplicationRow[]; error: { message: string } | null }> {
  const first = await client
    .from("job_applications")
    .select("id, job_id, candidate_id, created_at, unlocked, review_status")
    .in("job_id", jobIds)
    .order("created_at", { ascending: false })
    .limit(MAX_APPLICATIONS);

  if (
    first.error &&
    isSupabaseSchemaError(first.error) &&
    (schemaErrorMentionsColumn(first.error, "unlocked") ||
      schemaErrorMentionsColumn(first.error, "review_status"))
  ) {
    const fallback = await client
      .from("job_applications")
      .select("id, job_id, candidate_id, created_at")
      .in("job_id", jobIds)
      .order("created_at", { ascending: false })
      .limit(MAX_APPLICATIONS);
    return {
      rows: (fallback.data ?? []) as ApplicationRow[],
      error: fallback.error,
    };
  }

  return {
    rows: (first.data ?? []) as ApplicationRow[],
    error: first.error,
  };
}

export async function GET(request: Request) {
  const access = await requireApiUser(request);
  if (access instanceof NextResponse) {
    return access;
  }

  const reader = createServiceRoleClient() ?? access.supabase;
  const viewerRow = await fetchProfileForCandidateId(
    reader,
    access.user.id,
    "id, user_id, role"
  );
  const viewerRole = resolveAccountRole(
    typeof viewerRow?.role === "string" ? viewerRow.role : null,
    access.user
  );

  if (!isEmployerRole(viewerRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employerIds = employerIdentityIds(access.user.id, viewerRow);
  const { jobs, error: jobsError } = await fetchEmployerJobs(reader, employerIds);

  if (jobsError) {
    console.error("[employer applicants] jobs lookup failed:", jobsError.message);
    return NextResponse.json(
      { error: "Could not load interested candidates." },
      { status: 500 }
    );
  }

  const jobSummaries = jobs.map((job) => ({
    id: job.id,
    title: job.title?.trim() || "Open Role",
    status: job.status === "paused" ? "Paused" : "Active",
  }));

  if (jobs.length === 0) {
    return NextResponse.json(
      { applicants: [], jobs: jobSummaries } satisfies EmployerApplicantsPayload,
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const jobIds = jobs.map((job) => job.id);
  const jobsById = new Map(jobs.map((job) => [job.id, job]));

  const { rows, error: applicationsError } = await fetchJobApplications(
    reader,
    jobIds
  );

  if (applicationsError) {
    console.error(
      "[employer applicants] applications lookup failed:",
      applicationsError.message
    );
    return NextResponse.json(
      { error: "Could not load interested candidates." },
      { status: 500 }
    );
  }

  const candidateIds = [
    ...new Set(rows.map((row) => row.candidate_id).filter(Boolean)),
  ];

  let profilesByRef = await fetchProfilesForCandidateIds(
    reader,
    candidateIds,
    APPLICANT_PROFILE_COLUMNS.join(", ")
  );

  if (profilesByRef.size === 0 && candidateIds.length > 0) {
    const fallbackColumns = APPLICANT_PROFILE_COLUMNS.filter(
      (column) => column !== "key_accomplishments"
    );
    profilesByRef = await fetchProfilesForCandidateIds(
      reader,
      candidateIds,
      fallbackColumns.join(", ")
    );
  }

  const matchByKey = new Map<string, MatchResult | number>();
  if (candidateIds.length > 0) {
    const { data: matchRows, error: matchError } = await reader
      .from("talent_match_scores")
      .select(
        "candidate_id, job_id, match_percentage, reasoning, matching_skills, missing_skills"
      )
      .in("employer_id", employerIds)
      .in("job_id", jobIds)
      .in("candidate_id", candidateIds);

    if (matchError) {
      console.error(
        "[employer applicants] match scores lookup failed:",
        matchError.message
      );
    } else {
      for (const row of matchRows ?? []) {
        if (!row.candidate_id || !row.job_id) {
          continue;
        }
        matchByKey.set(matchKey(row.job_id, row.candidate_id), {
          match_percentage: row.match_percentage,
          reasoning: typeof row.reasoning === "string" ? row.reasoning : "",
          matching_skills: Array.isArray(row.matching_skills)
            ? row.matching_skills.filter(
                (skill): skill is string => typeof skill === "string"
              )
            : [],
          missing_skills: Array.isArray(row.missing_skills)
            ? row.missing_skills.filter(
                (skill): skill is string => typeof skill === "string"
              )
            : [],
        });
      }
    }
  }

  const introIds = new Set<string>();
  const profileIds = [
    ...new Set(
      candidateIds
        .map((id) => {
          const profile = profilesByRef.get(id) as ApplicantProfileRow | undefined;
          return (
            (typeof profile?.id === "string" && profile.id) ||
            (typeof profile?.user_id === "string" && profile.user_id) ||
            id
          );
        })
        .filter(Boolean)
    ),
  ];

  if (profileIds.length > 0) {
    const { data: introRows, error: introError } = await reader
      .from("intro_requests")
      .select("candidate_id")
      .in("user_id", employerIds)
      .in("candidate_id", profileIds);

    if (introError) {
      console.warn(
        "[employer applicants] intro requests lookup failed:",
        introError.message
      );
    } else {
      for (const row of introRows ?? []) {
        if (typeof row.candidate_id === "string" && row.candidate_id.trim()) {
          introIds.add(row.candidate_id.trim());
        }
      }
    }
  }

  const applicants = rows.flatMap((row) => {
    const job = jobsById.get(row.job_id);
    if (!job) {
      return [];
    }

    const profile = (profilesByRef.get(row.candidate_id) ??
      null) as ApplicantProfileRow | null;
    const profileId =
      (typeof profile?.id === "string" && profile.id) || row.candidate_id;

    return [
      mapEmployerApplicant({
        applicationId: row.id,
        candidateId: row.candidate_id,
        createdAt: row.created_at,
        unlocked: row.unlocked,
        profile,
        job: {
          id: job.id,
          title: job.title?.trim() || "Open Role",
          status: job.status,
          techStack: parseJobListInput(job.tech_stack),
          requiredSkills: parseJobListInput(
            job.required_skills && job.required_skills.length > 0
              ? job.required_skills
              : job.tags
          ),
          tags: parseJobListInput(job.tags),
        },
        cachedMatch: matchByKey.get(matchKey(row.job_id, row.candidate_id)),
        introRequested:
          introIds.has(profileId) || introIds.has(row.candidate_id),
        reviewStatus: row.review_status,
      }),
    ];
  });

  return NextResponse.json(
    { applicants, jobs: jobSummaries } satisfies EmployerApplicantsPayload,
    { headers: { "Cache-Control": "no-store" } }
  );
}

const APPLICATION_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request) {
  const access = await requireApiUser(request);
  if (access instanceof NextResponse) {
    return access;
  }

  const reader = createServiceRoleClient() ?? access.supabase;
  const viewerRow = await fetchProfileForCandidateId(
    reader,
    access.user.id,
    "id, user_id, role"
  );
  const viewerRole = resolveAccountRole(
    typeof viewerRow?.role === "string" ? viewerRow.role : null,
    access.user
  );

  if (!isEmployerRole(viewerRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    applicationId?: string;
    status?: string;
  } | null;

  const applicationId = body?.applicationId?.trim() ?? "";
  const status = body?.status?.trim().toLowerCase() ?? "";

  if (!APPLICATION_UUID_PATTERN.test(applicationId) || status !== "rejected") {
    return NextResponse.json({ error: "Invalid status update." }, { status: 400 });
  }

  const employerIds = employerIdentityIds(access.user.id, viewerRow);

  const { data: application, error: applicationError } = await reader
    .from("job_applications")
    .select("id, job_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (applicationError) {
    console.error(
      "[employer applicants] reject lookup failed:",
      applicationError.message
    );
    return NextResponse.json(
      { error: "Could not update candidate status." },
      { status: 500 }
    );
  }

  if (!application?.job_id) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const { data: job, error: jobError } = await reader
    .from("jobs")
    .select("id, employer_id")
    .eq("id", application.job_id)
    .maybeSingle();

  if (jobError) {
    console.error("[employer applicants] reject job lookup failed:", jobError.message);
    return NextResponse.json(
      { error: "Could not update candidate status." },
      { status: 500 }
    );
  }

  if (!job || !employerIds.includes(job.employer_id)) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const { error: updateError } = await reader
    .from("job_applications")
    .update({ review_status: "rejected" })
    .eq("id", applicationId);

  if (updateError) {
    console.error(
      "[employer applicants] reject update failed:",
      updateError.message
    );
    return NextResponse.json(
      { error: "Could not update candidate status." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { ok: true, applicationId, status: "rejected" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
