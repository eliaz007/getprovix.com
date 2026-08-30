import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import { hashEmployerVerificationToken } from "@/lib/employer-email-verification";

export const runtime = "nodejs";

function redirectToDashboard(origin: string, verified: boolean, error?: string) {
  const url = new URL("/dashboard", origin);
  if (verified) {
    url.searchParams.set("employer_verified", "1");
  } else {
    url.searchParams.set("employer_verified", "0");
    if (error) {
      url.searchParams.set("verify_error", error);
    }
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const token = requestUrl.searchParams.get("token")?.trim() ?? "";

  if (!token) {
    return redirectToDashboard(origin, false, "missing_token");
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return redirectToDashboard(origin, false, "unavailable");
  }

  const tokenHash = hashEmployerVerificationToken(token);
  const nowIso = new Date().toISOString();

  const { data: claim, error: claimError } = await admin
    .from("employer_email_verifications")
    .update({ consumed_at: nowIso })
    .eq("token_hash", tokenHash)
    .is("consumed_at", null)
    .gt("expires_at", nowIso)
    .select("user_id, email")
    .maybeSingle();

  if (claimError) {
    console.error("[employer-verify] token claim failed:", claimError);
    return redirectToDashboard(origin, false, "invalid");
  }

  if (!claim?.user_id || !claim.email) {
    return redirectToDashboard(origin, false, "invalid");
  }

  const verifiedEmail = String(claim.email).trim().toLowerCase();
  const profilePatch = {
    is_verified: true,
    email_verified_at: nowIso,
    contact_email: verifiedEmail,
    email: verifiedEmail,
  };

  const { data: updatedById, error: updateByIdError } = await admin
    .from("profiles")
    .update(profilePatch)
    .eq("id", claim.user_id)
    .select("id")
    .maybeSingle();

  let updated = updatedById;
  let updateError = updateByIdError;

  if (!updated && !updateError) {
    const retry = await admin
      .from("profiles")
      .update(profilePatch)
      .eq("user_id", claim.user_id)
      .select("id")
      .maybeSingle();
    updated = retry.data;
    updateError = retry.error;
  }

  if (updateError || !updated) {
    console.error("[employer-verify] profile verify failed:", updateError);
    await admin
      .from("employer_email_verifications")
      .update({ consumed_at: null })
      .eq("token_hash", tokenHash)
      .eq("consumed_at", nowIso);
    return redirectToDashboard(origin, false, "update_failed");
  }

  await admin
    .from("employer_email_verifications")
    .update({ consumed_at: nowIso })
    .eq("user_id", claim.user_id)
    .is("consumed_at", null);

  return redirectToDashboard(origin, true);
}
