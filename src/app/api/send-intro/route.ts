import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/utils/supabase/server";

type SendIntroBody = {
  requestId?: string;
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

async function isAdminUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Supabase Save Error:", error);
    return false;
  }

  return data?.role === "admin";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await isAdminUser(supabase, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as SendIntroBody;
    const requestId = body.requestId?.trim();

    if (!requestId) {
      return NextResponse.json(
        { error: "requestId is required" },
        { status: 400 }
      );
    }

    const { data, error: fetchError } = await supabase
      .from("intro_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (fetchError) {
      console.error("Supabase Save Error:", fetchError);
      return NextResponse.json(
        { error: "Could not load intro request" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Intro request not found" },
        { status: 404 }
      );
    }

    const introRequest = data as IntroRequestRecord;
    const workEmail = introRequest.work_email?.trim();

    if (!workEmail) {
      return NextResponse.json(
        { error: "Missing employer work email" },
        { status: 400 }
      );
    }

    const candidateName = introRequest.candidate_name?.trim() || "Candidate";
    const companyName = introRequest.company_name?.trim() || "your company";
    const roleTitle = introRequest.role_title?.trim() || "Open role";
    const compensationBand =
      introRequest.compensation_band?.trim() || "Not specified";

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 500 }
      );
    }

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
      console.error("Supabase Save Error:", emailError);
      return NextResponse.json(
        { error: "Failed to send intro email" },
        { status: 500 }
      );
    }

    const { error: updateError } = await supabase
      .from("intro_requests")
      .update({ status: "approved" })
      .eq("id", requestId);

    if (updateError) {
      console.error("Supabase Save Error:", updateError);
      return NextResponse.json(
        { error: "Email sent but status update failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Supabase Save Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
