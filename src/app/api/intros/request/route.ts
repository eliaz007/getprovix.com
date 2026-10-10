import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/admin-access";
import { requireVerifiedEmployer } from "@/lib/api-auth";
import { isCorporateWorkEmail } from "@/lib/corporate-email";
import {
  buildIntroRequestInsertPayload,
  CANDIDATE_INTRO_REQUEST_COLUMNS,
} from "@/lib/candidate-intro-requests";
import {
  CONTRACT_INTRO_COMMITMENT_OPTIONS,
  CONTRACT_INTRO_DURATION_OPTIONS,
  formatContractIntroCompensationRange,
} from "@/lib/intro-hire-type";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import { sendCandidateIntroRequestEmail } from "@/lib/send-intro-email";

const introRequestBodySchema = z.object({
  candidateId: z.string().trim().min(1),
  candidateName: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  companyEmail: z
    .string()
    .trim()
    .min(1)
    .refine((email) => isCorporateWorkEmail(email), {
      message: "A valid corporate work email is required.",
    }),
  targetRole: z.string().trim().min(1),
  compensationRange: z.string().trim().min(1),
  hireType: z.enum(["fulltime", "contract"]).optional().default("fulltime"),
  contractHourlyRate: z.number().positive().optional(),
  estimatedCommitment: z
    .enum(CONTRACT_INTRO_COMMITMENT_OPTIONS)
    .optional(),
  estimatedDuration: z.enum(CONTRACT_INTRO_DURATION_OPTIONS).optional(),
  termsAccepted: z.literal(true),
});

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function POST(request: Request) {
  try {
    const access = await requireVerifiedEmployer(request);
    if (access instanceof NextResponse) {
      return access;
    }

    const { user, supabase: authClient } = access;

    const parsedBody = await parseJsonWithSchema(request, introRequestBodySchema);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const body = parsedBody.data;
    const candidateId = body.candidateId;
    if (!isUuid(candidateId)) {
      return NextResponse.json(
        { error: "A valid candidate profile id is required." },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient() ?? authClient;
    const tosAcceptedAt = new Date().toISOString();
    const responseToken = randomUUID();

    // Contract details are folded into compensation_range/band text so existing
    // full-time intro_requests rows and columns stay compatible.
    let compensationRange = body.compensationRange;
    if (body.hireType === "contract") {
      if (
        typeof body.contractHourlyRate === "number" &&
        body.estimatedCommitment &&
        body.estimatedDuration
      ) {
        compensationRange = formatContractIntroCompensationRange({
          hourlyRate: body.contractHourlyRate,
          commitment: body.estimatedCommitment,
          duration: body.estimatedDuration,
        });
      } else if (!/^Contract\s+\$/i.test(compensationRange)) {
        return NextResponse.json(
          {
            error:
              "Contract introductions require hourly rate, commitment, and duration.",
          },
          { status: 400 }
        );
      }
    }

    const insertPayload = buildIntroRequestInsertPayload({
      userId: user.id,
      candidateId,
      candidateName: body.candidateName,
      companyName: body.companyName,
      companyEmail: body.companyEmail,
      targetRole: body.targetRole,
      compensationRange,
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
      .eq("id", candidateId)
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
