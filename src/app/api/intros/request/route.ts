import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import { isEmployerRole } from "@/lib/dashboard-account";
import {
  buildIntroRequestInsertPayload,
  CANDIDATE_INTRO_REQUEST_COLUMNS,
} from "@/lib/candidate-intro-requests";
import { sendCandidateIntroRequestEmail } from "@/lib/send-intro-email";
import { createClient } from "@/utils/supabase/server";

type IntroRequestBody = {
  candidateId?: string;
  candidateName?: string;
  companyName?: string;
  companyEmail?: string;
  targetRole?: string;
  compensationRange?: string;
  termsAccepted?: boolean;
};

function isValidBody(body: unknown): body is Required<
  Pick<
    IntroRequestBody,
    | "candidateId"
    | "candidateName"
    | "companyName"
    | "companyEmail"
    | "targetRole"
    | "compensationRange"
  >
> & { termsAccepted: true } {
  if (!body || typeof body !== "object") {
    return false;
  }

  const record = body as IntroRequestBody;
  return (
    typeof record.candidateId === "string" &&
    record.candidateId.trim().length > 0 &&
    typeof record.candidateName === "string" &&
    record.candidateName.trim().length > 0 &&
    typeof record.companyName === "string" &&
    record.companyName.trim().length > 0 &&
    typeof record.companyEmail === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.companyEmail.trim()) &&
    typeof record.targetRole === "string" &&
    record.targetRole.trim().length > 0 &&
    typeof record.compensationRange === "string" &&
    record.compensationRange.trim().length > 0 &&
    record.termsAccepted === true
  );
}

export async function POST(request: Request) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await authClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!isEmployerRole(profile?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as IntroRequestBody;
    if (!isValidBody(body)) {
      return NextResponse.json(
        { error: "Invalid intro request payload." },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient() ?? authClient;
    const tosAcceptedAt = new Date().toISOString();
    const responseToken = randomUUID();
    const insertPayload = buildIntroRequestInsertPayload({
      userId: user.id,
      candidateId: body.candidateId.trim(),
      candidateName: body.candidateName.trim(),
      companyName: body.companyName.trim(),
      companyEmail: body.companyEmail.trim(),
      targetRole: body.targetRole.trim(),
      compensationRange: body.compensationRange.trim(),
      tosAcceptedAt,
      responseToken,
    });

    const { data: introRequest, error: insertError } = await authClient
      .from("intro_requests")
      .insert(insertPayload)
      .select(CANDIDATE_INTRO_REQUEST_COLUMNS)
      .single();

    if (insertError || !introRequest) {
      console.error("Intro request insert error:", insertError);
      return NextResponse.json(
        { error: "Could not submit intro request." },
        { status: 500 }
      );
    }

    const { data: candidateProfile } = await serviceClient
      .from("profiles")
      .select("contact_email, email")
      .eq("id", body.candidateId.trim())
      .maybeSingle();

    const candidateEmail =
      candidateProfile?.contact_email?.trim() ||
      candidateProfile?.email?.trim() ||
      "";

    if (candidateEmail) {
      await sendCandidateIntroRequestEmail(
        introRequest,
        candidateEmail,
        serviceClient
      );
    } else {
      console.warn(
        "Intro request saved but candidate email unavailable for notification."
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: introRequest.id,
          status: introRequest.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Intro request API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
