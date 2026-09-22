import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  resolveIntroCompanyEmail,
  resolveIntroCompensationRange,
  resolveIntroTargetRole,
} from "@/lib/candidate-intro-requests";
import { getPublicProfileBaseUrl } from "@/lib/profile-url";

export type IntroRequestEmailRecord = {
  id: string;
  candidate_id: string;
  candidate_name: string | null;
  company_name: string | null;
  work_email?: string | null;
  company_email?: string | null;
  role_title?: string | null;
  target_role?: string | null;
  compensation_band?: string | null;
  compensation_range?: string | null;
  status: string;
};

type CandidateContactDetails = {
  fullName: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
};

const CANDIDATE_CONTACT_COLUMNS =
  "full_name, contact_email, email, phone, linkedin_url, portfolio_url";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveContactEmail(input: {
  contact_email?: string | null;
  email?: string | null;
}): string | null {
  const contactEmail = input.contact_email?.trim();
  if (contactEmail) {
    return contactEmail;
  }

  const email = input.email?.trim();
  return email || null;
}

async function fetchCandidateContactDetails(
  dataClient: SupabaseClient,
  introRequest: IntroRequestEmailRecord
): Promise<CandidateContactDetails> {
  const fallbackName = introRequest.candidate_name?.trim() || "Candidate";

  if (!isUuid(introRequest.candidate_id)) {
    return {
      fullName: fallbackName,
      email: null,
      phone: null,
      linkedinUrl: null,
      portfolioUrl: null,
    };
  }

  const { data: profile, error } = await dataClient
    .from("profiles")
    .select(CANDIDATE_CONTACT_COLUMNS)
    .eq("id", introRequest.candidate_id)
    .maybeSingle();

  if (error) {
    console.error("Intro email candidate contact fetch error:", error);
  }

  if (!profile) {
    return {
      fullName: fallbackName,
      email: null,
      phone: null,
      linkedinUrl: null,
      portfolioUrl: null,
    };
  }

  return {
    fullName: profile.full_name?.trim() || fallbackName,
    email: resolveContactEmail(profile),
    phone: profile.phone?.trim() || null,
    linkedinUrl: profile.linkedin_url?.trim() || null,
    portfolioUrl: profile.portfolio_url?.trim() || null,
  };
}

function renderContactValue(
  label: string,
  value: string | null,
  options?: { hrefPrefix?: "mailto:" | "tel:" | "" }
): string {
  if (!value) {
    return `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; width: 140px;">${label}</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #9ca3af;">Not provided</td>
        </tr>
      `.trim();
  }

  const safeValue = escapeHtml(value);
  const hrefPrefix = options?.hrefPrefix ?? "";
  const displayValue =
    hrefPrefix === "mailto:" || hrefPrefix === "tel:"
      ? `<a href="${hrefPrefix}${safeValue}" style="color: #4338ca; text-decoration: none;">${safeValue}</a>`
      : hrefPrefix === ""
        ? `<a href="${safeValue.startsWith("http") ? safeValue : `https://${safeValue}`}" style="color: #4338ca; text-decoration: none;">${safeValue}</a>`
        : safeValue;

  return `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; width: 140px;">${label}</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${displayValue}</td>
      </tr>
    `.trim();
}

function resolveEmployerEmail(introRequest: IntroRequestEmailRecord): string {
  return resolveIntroCompanyEmail(introRequest);
}

function resolveRoleTitle(introRequest: IntroRequestEmailRecord): string {
  return resolveIntroTargetRole(introRequest);
}

function resolveCompensationBand(introRequest: IntroRequestEmailRecord): string {
  return resolveIntroCompensationRange(introRequest);
}

export function buildCandidateIntroRequestEmailHtml(input: {
  candidateName: string;
  companyName: string;
  companyEmail: string;
  targetRole: string;
  compensationRange: string;
  acceptUrl: string;
  declineUrl: string;
  dashboardUrl: string;
}): string {
  const safeCandidateName = escapeHtml(input.candidateName);
  const safeCompanyName = escapeHtml(input.companyName);
  const safeCompanyEmail = escapeHtml(input.companyEmail);
  const safeTargetRole = escapeHtml(input.targetRole);
  const safeCompensationRange = escapeHtml(input.compensationRange);
  const safeAcceptUrl = escapeHtml(input.acceptUrl);
  const safeDeclineUrl = escapeHtml(input.declineUrl);
  const safeDashboardUrl = escapeHtml(input.dashboardUrl);

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #111827; max-width: 640px; margin: 0 auto; padding: 24px;">
      <p style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #7c3aed; font-weight: 700; margin: 0 0 12px;">
        Provix Intro Request
      </p>
      <h1 style="font-size: 24px; margin: 0 0 16px;">
        ${safeCompanyName} wants to connect with you
      </h1>
      <p style="margin: 0 0 16px;">
        Hi ${safeCandidateName}, a verified employer submitted a warm introduction request through Provix. Review the details below and choose whether to accept.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px;">
        <tr>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; width: 140px;">Company</td>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${safeCompanyName}</td>
        </tr>
        <tr>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">Contact</td>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${safeCompanyEmail}</td>
        </tr>
        <tr>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">Role</td>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${safeTargetRole}</td>
        </tr>
        <tr>
          <td style="padding: 14px 16px; font-size: 12px; color: #6b7280;">Compensation</td>
          <td style="padding: 14px 16px; font-weight: 600;">${safeCompensationRange}</td>
        </tr>
      </table>
      <div style="display: flex; gap: 12px; margin: 0 0 20px;">
        <a href="${safeAcceptUrl}" style="display: inline-block; background: #7c3aed; color: #ffffff; text-decoration: none; font-weight: 700; padding: 12px 20px; border-radius: 12px;">
          Accept Intro
        </a>
        <a href="${safeDeclineUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; font-weight: 700; padding: 12px 20px; border-radius: 12px;">
          Decline
        </a>
      </div>
      <p style="margin: 0 0 8px; color: #374151; font-size: 14px;">
        You can also review pending requests anytime in your Provix dashboard.
      </p>
      <p style="margin: 0;">
        <a href="${safeDashboardUrl}" style="color: #4338ca; text-decoration: none; font-weight: 600;">Open Intro Requests</a>
      </p>
    </div>
  `.trim();
}

export async function sendCandidateIntroRequestEmail(
  introRequest: IntroRequestEmailRecord & { response_token?: string | null },
  candidateEmail: string,
  dataClient: SupabaseClient
): Promise<void> {
  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.warn(
        "Candidate intro request email: RESEND_API_KEY is not set; skipping email."
      );
      return;
    }

    const trimmedCandidateEmail = candidateEmail.trim();
    if (!trimmedCandidateEmail) {
      console.warn(
        "Candidate intro request email: candidate email unavailable; skipping email."
      );
      return;
    }

    const responseToken = introRequest.response_token?.trim();
    if (!responseToken) {
      console.warn(
        "Candidate intro request email: response token missing; skipping email."
      );
      return;
    }

    const candidateContact = await fetchCandidateContactDetails(
      dataClient,
      introRequest
    );
    const appBaseUrl = getPublicProfileBaseUrl();
    const acceptUrl = `${appBaseUrl}/api/intros/${introRequest.id}/respond?action=accept&token=${encodeURIComponent(responseToken)}`;
    const declineUrl = `${appBaseUrl}/api/intros/${introRequest.id}/respond?action=decline&token=${encodeURIComponent(responseToken)}`;
    const dashboardUrl = `${appBaseUrl}/dashboard?tab=intro_requests`;

    const resend = new Resend(resendApiKey);
    const { error: emailError } = await resend.emails.send({
      from: "Provix <notifications@getprovix.com>",
      to: trimmedCandidateEmail,
      subject: `Intro request from ${introRequest.company_name?.trim() || "a verified employer"}`,
      html: buildCandidateIntroRequestEmailHtml({
        candidateName: candidateContact.fullName,
        companyName: introRequest.company_name?.trim() || "Verified employer",
        companyEmail: resolveEmployerEmail(introRequest),
        targetRole: resolveRoleTitle(introRequest),
        compensationRange: resolveCompensationBand(introRequest),
        acceptUrl,
        declineUrl,
        dashboardUrl,
      }),
    });

    if (emailError) {
      console.warn("Candidate intro request email warning:", emailError);
    }
  } catch (error) {
    console.warn("Candidate intro request email warning:", error);
  }
}

export function buildIntroEmailHtml(input: {
  candidateName: string;
  companyName: string;
  roleTitle: string;
  compensationBand: string;
  candidateContact: CandidateContactDetails;
}): string {
  const { candidateName, companyName, roleTitle, compensationBand, candidateContact } =
    input;

  const safeCandidateName = escapeHtml(candidateName);
  const safeCompanyName = escapeHtml(companyName);
  const safeRoleTitle = escapeHtml(roleTitle);
  const safeCompensationBand = escapeHtml(compensationBand);
  const safeFullName = escapeHtml(candidateContact.fullName);

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #111827; max-width: 640px; margin: 0 auto; padding: 24px;">
      <p style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #7c3aed; font-weight: 700; margin: 0 0 12px;">
        Provix Warm Intro
      </p>
      <h1 style="font-size: 24px; margin: 0 0 16px;">
        Introduction: ${safeCandidateName} × ${safeCompanyName}
      </h1>
      <p style="margin: 0 0 16px;">
        A Provix-verified candidate is ready for a warm introduction aligned to your hiring pipeline.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px;">
        <tr>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; width: 140px;">Candidate</td>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${safeCandidateName}</td>
        </tr>
        <tr>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">Company</td>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${safeCompanyName}</td>
        </tr>
        <tr>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">Role</td>
          <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${safeRoleTitle}</td>
        </tr>
        <tr>
          <td style="padding: 14px 16px; font-size: 12px; color: #6b7280;">Compensation</td>
          <td style="padding: 14px 16px; font-weight: 600;">${safeCompensationBand}</td>
        </tr>
      </table>
      <h2 style="font-size: 16px; margin: 0 0 12px; color: #111827;">
        Candidate Contact Details
      </h2>
      <p style="margin: 0 0 12px; color: #374151; font-size: 14px;">
        Use the verified contact information below to coordinate next steps directly with the candidate.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 12px;">
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #c7d2fe; font-size: 12px; color: #4338ca; width: 140px;">Full Name</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #c7d2fe; font-weight: 700; color: #111827;">${safeFullName}</td>
        </tr>
        ${renderContactValue("Email", candidateContact.email, { hrefPrefix: "mailto:" })}
        ${renderContactValue("Phone", candidateContact.phone, { hrefPrefix: "tel:" })}
        ${renderContactValue("LinkedIn", candidateContact.linkedinUrl)}
        ${renderContactValue("Portfolio", candidateContact.portfolioUrl)}
      </table>
      <p style="margin: 0 0 8px;">
        This candidate was vetted through Provix proof-of-work signals and matched to the role and compensation band you submitted.
      </p>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">
        Reply All on this email to reach the candidate immediately and coordinate next steps with your hiring team.
      </p>
    </div>
  `.trim();
}

export async function sendIntroEmail(
  introRequest: IntroRequestEmailRecord,
  dataClient: SupabaseClient
): Promise<void> {
  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.warn("Intro email: RESEND_API_KEY is not set; skipping intro email.");
      return;
    }

    const workEmail = resolveEmployerEmail(introRequest);
    if (!workEmail) {
      console.warn("Intro email: intro request has no work email; skipping intro email.");
      return;
    }

    const candidateContact = await fetchCandidateContactDetails(
      dataClient,
      introRequest
    );
    const candidateName = candidateContact.fullName;
    const companyName = introRequest.company_name?.trim() || "your company";
    const roleTitle = resolveRoleTitle(introRequest);
    const compensationBand = resolveCompensationBand(introRequest);
    const candidateEmail = candidateContact.email;

    const resend = new Resend(resendApiKey);
    const emailPayload: {
      from: string;
      to: string;
      subject: string;
      html: string;
      cc?: string[];
      replyTo?: string;
    } = {
      from: "Provix <notifications@getprovix.com>",
      to: workEmail,
      subject: `Intro: ${candidateName} x ${companyName}`,
      html: buildIntroEmailHtml({
        candidateName,
        companyName,
        roleTitle,
        compensationBand,
        candidateContact,
      }),
    };

    if (candidateEmail) {
      emailPayload.cc = [candidateEmail];
      emailPayload.replyTo = candidateEmail;
    } else {
      console.warn(
        "Intro email: candidate email unavailable; sending intro without cc/replyTo."
      );
    }

    const { error: emailError } = await resend.emails.send(emailPayload);

    if (emailError) {
      console.warn("Intro email warning:", emailError);
    }
  } catch (emailError) {
    console.warn("Intro email warning:", emailError);
  }
}
