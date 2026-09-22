import { Resend } from "resend";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildEmployerVerificationEmailHtml(input: {
  confirmUrl: string;
  workEmail: string;
}): string {
  const confirmUrl = escapeHtml(input.confirmUrl);
  const workEmail = escapeHtml(input.workEmail);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
      <p style="font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #7c3aed; font-weight: 700;">
        Provix Employer Verification
      </p>
      <h1 style="font-size: 22px; margin: 8px 0 16px;">Confirm your work email</h1>
      <p style="line-height: 1.6; color: #4b5563;">
        Click the button below to verify <strong>${workEmail}</strong> and unlock the
        Provix Talent Network, AI screening, and job posting tools.
      </p>
      <p style="margin: 28px 0;">
        <a href="${confirmUrl}" style="display: inline-block; background: #7c3aed; color: #ffffff; text-decoration: none; font-weight: 700; padding: 12px 20px; border-radius: 10px;">
          Get Verified
        </a>
      </p>
      <p style="font-size: 13px; line-height: 1.6; color: #6b7280;">
        This link expires in 24 hours. If you did not request this, you can ignore the email.
      </p>
    </div>
  `.trim();
}

export async function sendEmployerVerificationEmail(input: {
  to: string;
  confirmUrl: string;
}): Promise<{ error: string | null }> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return {
      error: "Email delivery is not configured. Set RESEND_API_KEY and try again.",
    };
  }

  const resend = new Resend(resendApiKey);
  const { error } = await resend.emails.send({
    from: "Provix <notifications@getprovix.com>",
    to: input.to,
    subject: "Confirm your Provix employer email",
    html: buildEmployerVerificationEmailHtml({
      confirmUrl: input.confirmUrl,
      workEmail: input.to,
    }),
  });

  if (error) {
    console.error("[employer-verify] Resend failed:", error);
    return { error: "Could not send the confirmation email. Try again shortly." };
  }

  return { error: null };
}
