import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/admin-api-auth";

const INTRO_REQUEST_COLUMNS =
  "id, candidate_name, candidate_id, company_name, work_email, role_title, compensation_band, status, created_at";

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

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error("Admin requests error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
