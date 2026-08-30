import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import { hashEmployerVerificationToken } from "@/lib/employer-email-verification";
import {
  employerIsVerifiedInDatabase,
  persistEmployerVerifiedFlag,
} from "@/lib/persist-employer-verified";

export const runtime = "nodejs";

const cookieOptions = {
  path: "/",
  sameSite: "lax" as const,
};

function resolveRedirectOrigin(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";

  if (!isLocalEnv && forwardedHost) {
    return `https://${forwardedHost}`;
  }

  if (envUrl) {
    return envUrl;
  }

  return new URL(request.url).origin;
}

function copyResponseCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
}

function verificationRedirect(
  origin: string,
  input: { verified: boolean; signedIn: boolean; error?: string },
  cookieSource: NextResponse
) {
  const path = input.signedIn ? "/dashboard" : "/login";
  const url = new URL(path, origin);

  if (!input.signedIn) {
    url.searchParams.set("next", "/dashboard");
  }

  if (input.verified) {
    url.searchParams.set("employer_verified", "1");
  } else {
    url.searchParams.set("employer_verified", "0");
    if (input.error) {
      url.searchParams.set("verify_error", input.error);
    }
  }

  const redirectResponse = NextResponse.redirect(url, 303);
  copyResponseCookies(cookieSource, redirectResponse);
  return redirectResponse;
}

export async function GET(request: NextRequest) {
  const origin = resolveRedirectOrigin(request);
  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";

  let cookieResponse = NextResponse.next({ request });
  let signedIn = false;

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions,
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              cookieResponse.cookies.set(name, value, {
                ...cookieOptions,
                ...options,
              });
            });
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  } catch (error) {
    console.warn("[employer-verify] session refresh during confirm failed:", error);
  }

  const fail = (error: string) =>
    verificationRedirect(origin, { verified: false, signedIn, error }, cookieResponse);
  const succeed = () =>
    verificationRedirect(origin, { verified: true, signedIn }, cookieResponse);

  if (!token) {
    return fail("missing_token");
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return fail("unavailable");
  }

  const tokenHash = hashEmployerVerificationToken(token);
  const nowIso = new Date().toISOString();

  try {
    const { data: pending, error: lookupError } = await admin
      .from("employer_email_verifications")
      .select("id, user_id, email, expires_at, consumed_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (lookupError) {
      console.error("[employer-verify] token lookup failed:", lookupError);
      return fail("invalid");
    }

    if (!pending?.user_id) {
      return fail("invalid");
    }

    const userId = String(pending.user_id);
    const workEmail = String(pending.email ?? "").trim().toLowerCase();
    const alreadyConsumed = Boolean(pending.consumed_at);
    const expired =
      typeof pending.expires_at === "string" &&
      new Date(pending.expires_at).getTime() <= Date.now();

    if (alreadyConsumed || expired) {
      if (await employerIsVerifiedInDatabase(admin, userId)) {
        return succeed();
      }
      return fail("invalid");
    }

    const persisted = await persistEmployerVerifiedFlag(admin, userId, workEmail);
    if (!persisted.ok) {
      console.error(
        "[employer-verify] failed to set is_verified=true for user",
        userId
      );
      return fail("update_failed");
    }

    const stillVerified = await employerIsVerifiedInDatabase(admin, userId);
    if (!stillVerified) {
      console.error(
        "[employer-verify] is_verified was not true after persist for",
        userId
      );
      return fail("update_failed");
    }

    const { error: consumeError } = await admin
      .from("employer_email_verifications")
      .update({ consumed_at: nowIso })
      .eq("id", pending.id)
      .is("consumed_at", null);

    if (consumeError) {
      console.warn("[employer-verify] token consume failed:", consumeError);
    }

    await admin
      .from("employer_email_verifications")
      .update({ consumed_at: nowIso })
      .eq("user_id", userId)
      .is("consumed_at", null);

    if (!(await employerIsVerifiedInDatabase(admin, userId))) {
      console.error("[employer-verify] is_verified did not remain true for", userId);
      return fail("update_failed");
    }

    return succeed();
  } catch (error) {
    console.error("[employer-verify] confirm threw:", error);
    return fail("update_failed");
  }
}
