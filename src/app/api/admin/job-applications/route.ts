import { NextResponse } from "next/server";
import { fetchProfilesForCandidateIds } from "@/lib/resolve-candidate-profile";
import { requireAdminApiAccess } from "@/lib/admin-api-auth";

const JOB_COLUMNS = "id, title, company, employer_id, created_at";
const APPLICATION_COLUMNS = "id, job_id, candidate_id, created_at";
const CANDIDATE_DOSSIER_COLUMNS =
  "id, full_name, codename_alias, contact_email, email, phone, linkedin_url, portfolio_url, bio, major, headline, job_title";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function GET() {
  try {
    const access = await requireAdminApiAccess();
    if (access instanceof NextResponse) {
      return access;
    }

    const { data: jobs, error: jobsError } = await access.dataClient
      .from("jobs")
      .select(JOB_COLUMNS)
      .order("created_at", { ascending: false });

    if (jobsError) {
      console.error("Admin jobs fetch error:", jobsError);
      return NextResponse.json(
        { error: "Could not load job postings" },
        { status: 500 }
      );
    }

    const { data: applications, error: applicationsError } =
      await access.dataClient
        .from("job_applications")
        .select(APPLICATION_COLUMNS)
        .order("created_at", { ascending: false });

    if (applicationsError) {
      console.error("Admin job applications fetch error:", applicationsError);
      return NextResponse.json(
        { error: "Could not load job interest submissions" },
        { status: 500 }
      );
    }

    const candidateIds = [
      ...new Set(
        (applications ?? [])
          .map((row) => row.candidate_id)
          .filter((value): value is string => Boolean(value && isUuid(value)))
      ),
    ];

    let dossierById = new Map<string, Record<string, unknown>>();

    if (candidateIds.length > 0) {
      dossierById = await fetchProfilesForCandidateIds(
        access.dataClient,
        candidateIds,
        CANDIDATE_DOSSIER_COLUMNS
      );
    }

    const applicationsByJobId = new Map<
      string,
      Array<{
        id: string;
        candidate_id: string;
        created_at: string;
        candidate_dossier: Record<string, unknown> | null;
      }>
    >();

    for (const application of applications ?? []) {
      const bucket = applicationsByJobId.get(application.job_id) ?? [];
      bucket.push({
        id: application.id,
        candidate_id: application.candidate_id,
        created_at: application.created_at,
        candidate_dossier: dossierById.get(application.candidate_id) ?? null,
      });
      applicationsByJobId.set(application.job_id, bucket);
    }

    const data = (jobs ?? []).map((job) => {
      const applicants = applicationsByJobId.get(job.id) ?? [];
      return {
        job_id: job.id,
        title: job.title,
        company: job.company,
        employer_id: job.employer_id,
        created_at: job.created_at,
        interest_count: applicants.length,
        applicants,
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Admin job applications error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
