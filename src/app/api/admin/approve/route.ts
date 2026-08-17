import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  parseIntroRequestId,
  requireAdminApiAccess,
} from "@/lib/admin-api-auth";

type AdminActionBody = {
  id?: string;
  requestId?: string;
  introId?: string;
};

type IntroRequestRecord = {
  id: string;
  candidate_name: string | null;
  company_name: string | null;
  work_email: string | null;
  role_title: string;
  compensation_band: string | null;
  status: string;
};

function buildIntroEmailHtml(input: {
  candidateName: string;
  companyName: string;
  roleTitle: string;
  compensationBand: string;
}): string {
  const { candidateName, companyName, roleTitle, compensationBand } = input;

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #111827; max-width: 640px; margin: 0 auto; padding: 24px;">
      <p style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6366f1; font-weight: 700; margin: 0 0 12px;">
        Provix Warm Intro
      </p>
      <h1 style="font-size: 24px; margin: 0 0 16px;">
        Introduction: ${candidateName} × ${companyName}
      </h1>
      <p style="margin: 0 0 16px;">
        A Provix-verified candidate is ready for a warm introduction aligned to your hiring pipeline.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px;">
        <tr>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; width: 140px;">Candidate</td>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${candidateName}</td>
        </tr>
        <tr>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">Company</td>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${companyName}</td>
        </tr>
        <tr>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">Role</td>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${roleTitle}</td>
        </tr>
        <tr>
          <td style="padding: 14px 16px; font-size: 12px; color: #6b7280;">Compensation</td>
          <td style="padding: 14px 16px; font-weight: 600;">${compensationBand}</td>
        </tr>
      </table>
      <p style="margin: 0 0 8px;">
        This candidate was vetted through Provix proof-of-work signals and matched to the role and compensation band you submitted.
      </p>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">
        Reply to this thread to coordinate next steps with your hiring team.
      </p>
    </div>
  `.trim();
}

async function sendIntroEmail(introRequest: IntroRequestRecord): Promise<void> {
  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.warn(
        "Admin approve: RESEND_API_KEY is not set; skipping intro email."
      );
      return;
    }

    const workEmail = introRequest.work_email?.trim();
    if (!workEmail) {
      console.warn(
        "Admin approve: intro request has no work email; skipping intro email."
      );
      return;
    }

    const candidateName = introRequest.candidate_name?.trim() || "Candidate";
    const companyName = introRequest.company_name?.trim() || "your company";
    const roleTitle = introRequest.role_title?.trim() || "Open role";
    const compensationBand =
      introRequest.compensation_band?.trim() || "Not specified";

    const resend = new Resend(resendApiKey);
    const { error: emailError } = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: workEmail,
      subject: `Intro: ${candidateName} x ${companyName}`,
      html: buildIntroEmailHtml({
        candidateName,
        companyName,
        roleTitle,
        compensationBand,
      }),
    });

    if (emailError) {
      console.warn("Admin approve email warning:", emailError);
    }
  } catch (emailError) {
    console.warn("Admin approve email warning:", emailError);
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAdminApiAccess();
    if (access instanceof NextResponse) {
      return access;
    }

    const body = (await request.json()) as AdminActionBody;
    const requestId = parseIntroRequestId(body);

    if (!requestId) {
      return NextResponse.json(
        { error: "Intro request id is required" },
        { status: 400 }
      );
    }

    const { data: updatedRequest, error: updateError } = await access.dataClient
      .from("intro_requests")
      .update({ status: "APPROVED" })
      .eq("id", requestId)
      .select()
      .single();

    if (updateError) {
      console.error("Admin approve update error:", updateError);
      return NextResponse.json(
        { error: "Could not update intro request status" },
        { status: 500 }
      );
    }

    if (!updatedRequest) {
      return NextResponse.json(
        { error: "Intro request not found" },
        { status: 404 }
      );
    }

    await sendIntroEmail(updatedRequest as IntroRequestRecord);

    return NextResponse.json(
      { success: true, data: updatedRequest },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin approve error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
