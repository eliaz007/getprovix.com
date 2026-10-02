import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CORPORATE_WORK_EMAIL_MESSAGE,
  extractEmailDomain,
  getCorporateWorkEmailValidationMessage,
  isCorporateWorkEmail,
  isFreeWebmailDomain,
} from "@/lib/corporate-email";
import {
  buildEmployerVerificationConfirmUrl,
  generateEmployerVerificationToken,
  hashEmployerVerificationToken,
} from "@/lib/employer-email-verification";
import {
  buildPasswordResetRedirectUrl,
  getStandardEmailValidationMessage,
  isStandardEmail,
  normalizeEmail,
} from "@/lib/validate-email";
import {
  buildEmployerVerificationEmailHtml,
  sendEmployerVerificationEmail,
} from "@/lib/send-employer-verification-email";
import { buildCandidateIntroRequestEmailHtml } from "@/lib/send-intro-email";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

describe("email dispatcher helpers and payload validation", () => {
  const originalResendKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    sendMock.mockReset();
    delete process.env.RESEND_API_KEY;
  });

  afterEach(() => {
    if (originalResendKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalResendKey;
    }
  });

  it("validates standard and corporate work email payloads", () => {
    expect(normalizeEmail("  founder@acme.com ")).toBe("founder@acme.com");
    expect(isStandardEmail("founder@acme.com")).toBe(true);
    expect(isStandardEmail("not-an-email")).toBe(false);
    expect(getStandardEmailValidationMessage("")).toBe(
      "Enter your email address."
    );
    expect(getStandardEmailValidationMessage("bad")).toBe(
      "Enter a valid email address."
    );
    expect(getStandardEmailValidationMessage("ok@acme.io")).toBeNull();

    expect(extractEmailDomain("Founder@Acme.IO")).toBe("acme.io");
    expect(isFreeWebmailDomain("gmail.com")).toBe(true);
    expect(isCorporateWorkEmail("hire@gmail.com")).toBe(false);
    expect(isCorporateWorkEmail("hire@acme.io")).toBe(true);
    expect(getCorporateWorkEmailValidationMessage("hire@gmail.com")).toBe(
      CORPORATE_WORK_EMAIL_MESSAGE
    );
    expect(getCorporateWorkEmailValidationMessage("hire@acme.io")).toBeNull();
  });

  it("builds verification tokens, confirm URLs, and escaped HTML payloads", () => {
    const { token, tokenHash } = generateEmployerVerificationToken();
    expect(token.length).toBeGreaterThan(20);
    expect(tokenHash).toBe(hashEmployerVerificationToken(token));
    expect(tokenHash).not.toBe(token);

    const confirmUrl = buildEmployerVerificationConfirmUrl(
      "https://www.getprovix.com",
      token
    );
    expect(confirmUrl.startsWith(
      "https://www.getprovix.com/api/employer/verify-email/confirm?token="
    )).toBe(true);
    expect(new URL(confirmUrl).searchParams.get("token")).toBe(token);

    const html = buildEmployerVerificationEmailHtml({
      confirmUrl: 'https://example.com/confirm?x="1"',
      workEmail: 'hire@acme.io<script>',
    });
    expect(html).toContain("Provix Employer Verification");
    expect(html).toContain("hire@acme.io&lt;script&gt;");
    expect(html).toContain('href="https://example.com/confirm?x=&quot;1&quot;"');
    expect(html).not.toContain("<script>");

    const introHtml = buildCandidateIntroRequestEmailHtml({
      candidateName: "Ada <Lovelace>",
      companyName: "Acme & Co",
      companyEmail: "talent@acme.io",
      targetRole: "Full-Stack Engineer",
      compensationRange: "$120k–$140k",
      acceptUrl: "https://getprovix.com/accept",
      declineUrl: "https://getprovix.com/decline",
      dashboardUrl: "https://getprovix.com/dashboard",
    });
    expect(introHtml).toContain("Ada &lt;Lovelace&gt;");
    expect(introHtml).toContain("Acme &amp; Co");
    expect(introHtml).toContain("Accept Intro");
    expect(buildPasswordResetRedirectUrl("https://www.getprovix.com")).toBe(
      "https://www.getprovix.com/auth/callback?next=%2Fupdate-password"
    );
  });

  it("dispatches employer verification email through Resend when configured", async () => {
    await expect(
      sendEmployerVerificationEmail({
        to: "hire@acme.io",
        confirmUrl: "https://getprovix.com/confirm",
      })
    ).resolves.toEqual({
      error:
        "Email delivery is not configured. Set RESEND_API_KEY and try again.",
    });
    expect(sendMock).not.toHaveBeenCalled();

    process.env.RESEND_API_KEY = "re_test_key";
    sendMock.mockResolvedValue({ error: null });

    await expect(
      sendEmployerVerificationEmail({
        to: "hire@acme.io",
        confirmUrl: "https://getprovix.com/confirm",
      })
    ).resolves.toEqual({ error: null });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Provix <notifications@getprovix.com>",
        to: "hire@acme.io",
        subject: "Confirm your Provix employer email",
        html: expect.stringContaining("hire@acme.io"),
      })
    );

    sendMock.mockResolvedValue({ error: { message: "rate limited" } });
    await expect(
      sendEmployerVerificationEmail({
        to: "hire@acme.io",
        confirmUrl: "https://getprovix.com/confirm",
      })
    ).resolves.toEqual({
      error: "Could not send the confirmation email. Try again shortly.",
    });
  });
});
