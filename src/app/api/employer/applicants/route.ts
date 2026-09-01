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
import { fetchProfileForCandidateId, fetchProfilesForCandidateIds } from "@/lib/resolve-candidate-profile";
import { isSupabaseSchemaError, schemaErrorMentionsColumn } from "@/lib/supabase-schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_APPLICATIONS = 80;

type ApplicationRow = {
  id: string;
  job_id: string;
  candidate_id: string;
  created_at: string;
  unlocked?: boolean | null;
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

export async function GET(request: Request) {
  const access = await requireApiUser(request);
  if (access instanceof NextResponse) {
    return access;
  }

  const viewerRow = await fetchProfileForCandidateId(
    access.supabase,
    access.user.id,
    "role"
  );
  const viewerRole = resolveAccountRole(
    typeof viewerRow?.role === "string" ? viewerRow.role : null,
    access.user
  );

  if (!isEmployerRole(viewerRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let listings: JobRow[] | null = null;
  let jobsError: { message: string } | null = null;

  {
    const first = await access.supabase
      .from("jobs")
      .select("id, title, status, tags, tech_stack, required_skills, created_at")
      .eq("employer_id", access.user.id)
      .order("created_at", { ascending: false });

    listings = (first.data ?? null) as JobRow[] | null;
    jobsError = first.error;

    if (
      jobsError &&
      isSupabaseSchemaError(jobsError) &&
      (schemaErrorMentionsColumn(jobsError, "tech_stack") ||
        schemaErrorMentionsColumn(jobsError, "required_skills"))
    ) {
      const fallback = await access.supabase
        .from("jobs")
        .select("id, title, status, tags, created_at")
        .eq("employer_id", access.user.id)
        .order("created_at", { ascending: false });
      listings = (fallback.data ?? []) as JobRow[];
      jobsError = fallback.error;
    }
  }

  if (jobsError) {
    console.error("[employer applicants] jobs lookup failed:", jobsError.message);
    return NextResponse.json(
      { error: "Could not load interested candidates." },
      { status: 500 }
    );
  }

  const jobs = (listings ?? []) as JobRow[];
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

  let applications: ApplicationRow[] | null = null;
  let applicationsError: { message: string } | null = null;

  {
    const first = await access.supabase
      .from("job_applications")
      .select("id, job_id, candidate_id, created_at, unlocked")
      .in("job_id", jobIds)
      .order("created_at", { ascending: false })
      .limit(MAX_APPLICATIONS);

    applications = (first.data ?? null) as ApplicationRow[] | null;
    applicationsError = first.error;

    if (
      applicationsError &&
      isSupabaseSchemaError(applicationsError) &&
      schemaErrorMentionsColumn(applicationsError, "unlocked")
    ) {
      const fallback = await access.supabase
        .from("job_applications")
        .select("id, job_id, candidate_id, created_at")
        .in("job_id", jobIds)
        .order("created_at", { ascending: false })
        .limit(MAX_APPLICATIONS);
      applications = (fallback.data ?? []) as ApplicationRow[];
      applicationsError = fallback.error;
    }
  }

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

  const rows = (applications ?? []) as ApplicationRow[];
  const candidateIds = [
    ...new Set(rows.map((row) => row.candidate_id).filter(Boolean)),
  ];

  const reader = createServiceRoleClient() ?? access.supabase;
  const profilesByRef = await fetchProfilesForCandidateIds(
    reader,
    candidateIds,
    APPLICANT_PROFILE_COLUMNS.join(", ")
  );

  const matchByKey = new Map<string, MatchResult | number>();
  if (candidateIds.length > 0) {
    const { data: matchRows, error: matchError } = await access.supabase
      .from("talent_match_scores")
      .select(
        "candidate_id, job_id, match_percentage, reasoning, matching_skills, missing_skills"
      )
      .eq("employer_id", access.user.id)
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
    const { data: introRows, error: introError } = await access.supabase
      .from("intro_requests")
      .select("candidate_id")
      .eq("user_id", access.user.id)
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
      }),
    ];
  });

  return NextResponse.json(
    { applicants, jobs: jobSummaries } satisfies EmployerApplicantsPayload,
    { headers: { "Cache-Control": "no-store" } }
  );
}
