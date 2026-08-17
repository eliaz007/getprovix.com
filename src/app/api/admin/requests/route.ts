import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/admin-api-auth";

const INTRO_REQUEST_COLUMNS =
  "id, candidate_name, candidate_id, company_name, work_email, role_title, compensation_band, status, terms_accepted, terms_agreed_at, created_at";

const CANDIDATE_DOSSIER_COLUMNS =
  "id, full_name, codename_alias, contact_email, email, phone, linkedin_url, portfolio_url, bio, major, headline, job_title, country, timezone";

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

    const { data, error } = await access.dataClient
      .from("intro_requests")
      .select(INTRO_REQUEST_COLUMNS)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Admin requests fetch error:", error);
      return NextResponse.json(
        { error: "Could not load intro requests" },
        { status: 500 }
      );
    }

    const rows = data ?? [];
    const candidateIds = [
      ...new Set(
        rows
          .map((row) => row.candidate_id)
          .filter((value): value is string => Boolean(value && isUuid(value)))
      ),
    ];

    let dossierById = new Map<string, Record<string, unknown>>();

    if (candidateIds.length > 0) {
      const { data: profiles, error: profileError } = await access.dataClient
        .from("profiles")
        .select(CANDIDATE_DOSSIER_COLUMNS)
        .in("id", candidateIds);

      if (profileError) {
        console.error("Admin candidate dossier fetch error:", profileError);
      } else {
        dossierById = new Map(
          (profiles ?? []).map((profile) => [profile.id as string, profile])
        );
      }
    }

    return NextResponse.json({
      data: rows.map((row) => ({
        ...row,
        candidate_dossier: dossierById.get(row.candidate_id) ?? null,
      })),
    });
  } catch (error) {
    console.error("Admin requests error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
