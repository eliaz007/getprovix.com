import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import { requireApiUser } from "@/lib/api-auth";
import { resolveAccountRole } from "@/lib/account-role";
import { getCorporateWorkEmailValidationMessage } from "@/lib/corporate-email";
import { isEmployerRole } from "@/lib/dashboard-account";
import {
  buildEmployerVerificationConfirmUrl,
  EMPLOYER_VERIFICATION_TTL_MS,
  generateEmployerVerificationToken,
} from "@/lib/employer-email-verification";
import { sendEmployerVerificationEmail } from "@/lib/send-employer-verification-email";
import { consumeRateLimit, tooManyRequestsResponse } from "@/lib/ip-rate-limit";
import { fetchProfileForCandidateId } from "@/lib/resolve-candidate-profile";
import { normalizeEmail } from "@/lib/validate-email";

export const runtime = "nodejs";

type VerifyEmailBody = {
  email?: string;
};

export async function POST(request: Request) {
  const access = await requireApiUser(request);
  if (access instanceof NextResponse) {
    return access;
  }

  const limited = consumeRateLimit(
    `employer-verify:${access.user.id}`,
    3,
    15 * 60 * 1000
  );
  if (!limited.ok) {
    return tooManyRequestsResponse(limited.retryAfterSec);
  }

  const viewerRow = await fetchProfileForCandidateId(
    access.supabase,
    access.user.id,
    "id, role, is_verified, contact_email, email"
  );
  const viewerRole = resolveAccountRole(
    typeof viewerRow?.role === "string" ? viewerRow.role : null,
    access.user
  );

  if (!isEmployerRole(viewerRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: VerifyEmailBody;
  try {
    body = (await request.json()) as VerifyEmailBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const workEmail = normalizeEmail(body.email ?? "").toLowerCase();
  const emailError = getCorporateWorkEmailValidationMessage(workEmail);
  if (emailError) {
    return NextResponse.json({ error: emailError }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Verification is temporarily unavailable." },
      { status: 503 }
    );
  }

  const { token, tokenHash } = generateEmployerVerificationToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EMPLOYER_VERIFICATION_TTL_MS).toISOString();

  const { error: invalidateError } = await admin
    .from("employer_email_verifications")
    .update({ consumed_at: now.toISOString() })
    .eq("user_id", access.user.id)
    .is("consumed_at", null);

  if (invalidateError) {
    console.error("[employer-verify] token invalidate failed:", invalidateError);
    return NextResponse.json(
      { error: "Could not start verification. Apply the latest database migration and try again." },
      { status: 500 }
    );
  }

  const { error: insertError } = await admin.from("employer_email_verifications").insert({
    user_id: access.user.id,
    email: workEmail,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (insertError) {
    console.error("[employer-verify] token insert failed:", insertError);
    return NextResponse.json(
      { error: "Could not create a verification link. Try again shortly." },
      { status: 500 }
    );
  }

  const profileId =
    typeof viewerRow?.id === "string" ? viewerRow.id : access.user.id;
  const currentVerifiedEmail = (
    (typeof viewerRow?.contact_email === "string" && viewerRow.contact_email) ||
    (typeof viewerRow?.email === "string" && viewerRow.email) ||
    ""
  )
    .trim()
    .toLowerCase();
  const emailChanged = currentVerifiedEmail !== workEmail;

  const profilePatch: Record<string, string | boolean | null> = {
    contact_email: workEmail,
    email: workEmail,
  };
  if (emailChanged && viewerRow?.is_verified === true) {
    profilePatch.is_verified = false;
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update(profilePatch)
    .eq("id", profileId);

  if (profileError) {
    console.warn("[employer-verify] profile email update failed:", profileError);
  }

  const confirmUrl = buildEmployerVerificationConfirmUrl(
    new URL(request.url).origin,
    token
  );
  const { error: sendError } = await sendEmployerVerificationEmail({
    to: workEmail,
    confirmUrl,
  });

  if (sendError) {
    return NextResponse.json({ error: sendError }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    email: workEmail,
    expires_at: expiresAt,
  });
}
