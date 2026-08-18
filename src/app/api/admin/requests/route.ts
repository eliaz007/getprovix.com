import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/admin-api-auth";
import {
  INTRO_PIPELINE_STATUSES,
  normalizeIntroPipelineStatus,
  type IntroPipelineStatus,
} from "@/lib/intro-request-status";
import {
  DEFAULT_CANDIDATE_BONUS,
  FLAT_FEE_THRESHOLD,
  parseCompensationValue,
} from "@/lib/placement-revenue";
import { sendIntroEmail } from "@/lib/send-intro-email";

export const INTRO_REQUEST_COLUMNS =
  "id, candidate_name, candidate_id, company_name, work_email, role_title, compensation_band, status, terms_accepted, terms_agreed_at, agreed_first_year_compensation, candidate_bonus_allocated, created_at";

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

type PatchIntroRequestBody = {
  requestId?: string;
  status?: string;
  agreed_first_year_compensation?: number | string | null;
  candidate_bonus_allocated?: number | string | null;
};

function isValidPipelineStatus(status: string): status is IntroPipelineStatus {
  return INTRO_PIPELINE_STATUSES.some((entry) => entry.value === status);
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAdminApiAccess();
    if (access instanceof NextResponse) {
      return access;
    }

    const body = (await request.json()) as PatchIntroRequestBody;
    const requestId = body.requestId?.trim() ?? "";
    const nextStatus = normalizeIntroPipelineStatus(body.status);

    if (!requestId) {
      return NextResponse.json(
        { error: "Intro request id is required" },
        { status: 400 }
      );
    }

    if (!body.status || !isValidPipelineStatus(nextStatus)) {
      return NextResponse.json({ error: "Invalid intro status." }, { status: 400 });
    }

    const { data: existingRequest, error: existingError } = await access.dataClient
      .from("intro_requests")
      .select(INTRO_REQUEST_COLUMNS)
      .eq("id", requestId)
      .maybeSingle();

    if (existingError) {
      console.error("Admin intro status lookup error:", existingError);
      return NextResponse.json(
        { error: "Could not load intro request" },
        { status: 500 }
      );
    }

    if (!existingRequest) {
      return NextResponse.json({ error: "Intro request not found" }, { status: 404 });
    }

    const previousStatus = normalizeIntroPipelineStatus(existingRequest.status);
    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
    };

    if (nextStatus === "hired") {
      const agreedSalary = parseCompensationValue(
        body.agreed_first_year_compensation ??
          existingRequest.agreed_first_year_compensation
      );

      if (!agreedSalary) {
        return NextResponse.json(
          {
            error:
              "Agreed first-year compensation is required when marking a placement as hired.",
          },
          { status: 400 }
        );
      }

      updatePayload.agreed_first_year_compensation = agreedSalary;

      if (agreedSalary <= FLAT_FEE_THRESHOLD) {
        updatePayload.candidate_bonus_allocated =
          parseCompensationValue(body.candidate_bonus_allocated) ??
          parseCompensationValue(existingRequest.candidate_bonus_allocated) ??
          DEFAULT_CANDIDATE_BONUS;
      } else {
        updatePayload.candidate_bonus_allocated = null;
      }
    }

    const { data: updatedRequest, error: updateError } = await access.dataClient
      .from("intro_requests")
      .update(updatePayload)
      .eq("id", requestId)
      .select(INTRO_REQUEST_COLUMNS)
      .single();

    if (updateError) {
      console.error("Admin intro status update error:", updateError);
      return NextResponse.json(
        { error: "Could not update intro request" },
        { status: 500 }
      );
    }

    if (
      nextStatus === "approved_intro_sent" &&
      previousStatus !== "approved_intro_sent"
    ) {
      await sendIntroEmail(updatedRequest, access.dataClient);
    }

    return NextResponse.json({ success: true, data: updatedRequest });
  } catch (error) {
    console.error("Admin intro status update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
