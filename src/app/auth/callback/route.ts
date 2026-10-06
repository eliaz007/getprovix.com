import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import {
  OAUTH_NEXT_COOKIE,
  isSafeOAuthNextPath,
  resolveOAuthSuccessPath,
} from "@/lib/auth-callback-url";
import { EMPLOYER_SIGNUP_COOKIE } from "@/lib/google-auth";
import { syncGitHubIdentityToProfile } from "@/lib/github-identity";

const cookieOptions = {
  path: "/",
  sameSite: "lax" as const,
};

function resolveOrigin(request: NextRequest) {
  const { origin } = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";

  if (!isLocalEnv && forwardedHost) {
    return `https://${forwardedHost}`;
  }

  return origin;
}

function readOAuthNextCookie(request: NextRequest): string | null {
  const raw = request.cookies.get(OAUTH_NEXT_COOKIE)?.value;
  if (!raw) {
    return null;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function clearAuthCookies(response: NextResponse) {
  response.cookies.set(EMPLOYER_SIGNUP_COOKIE, "", {
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(OAUTH_NEXT_COOKIE, "", {
    path: "/",
    maxAge: 0,
  });
}

/** Prefer returning to the in-app page that started OAuth (e.g. /onboarding). */
function buildFailedRedirectUrl(origin: string, nextPath: string): string {
  if (
    isSafeOAuthNextPath(nextPath) &&
    (nextPath.startsWith("/onboarding") || nextPath.startsWith("/dashboard"))
  ) {
    const url = new URL(nextPath, origin);
    url.searchParams.set("error", "oauth_failed");
    return url.toString();
  }

  return `${origin}/login?error=oauth_failed`;
}

function createClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, {
              ...cookieOptions,
              ...options,
            });
          });
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              response.headers.set(key, value);
            });
          }
        },
      },
    }
  );
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const origin = resolveOrigin(request);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const oauthError = error || errorDescription;
  const nextPath = resolveOAuthSuccessPath(
    searchParams.get("next"),
    readOAuthNextCookie(request)
  );
  const failedUrl = buildFailedRedirectUrl(origin, nextPath);

  const logGitHubAuthError = (
    reason: string,
    details: {
      error?: unknown;
      sessionUser?: unknown;
    } = {}
  ) => {
    console.error("DEBUG GITHUB AUTH ERROR:", {
      reason,
      error: details.error ?? error,
      errorDescription,
      errorCode:
        details.error &&
        typeof details.error === "object" &&
        details.error !== null &&
        "code" in details.error
          ? (details.error as { code?: unknown }).code
          : error,
      errorMessage:
        details.error instanceof Error
          ? details.error.message
          : details.error &&
              typeof details.error === "object" &&
              details.error !== null &&
              "message" in details.error
            ? (details.error as { message?: unknown }).message
            : errorDescription,
      sessionUser: details.sessionUser ?? null,
      url: requestUrl.toString(),
      searchParams: Object.fromEntries(searchParams.entries()),
      nextPath,
      hasCode: Boolean(code),
      hasTokenHash: Boolean(tokenHash),
      type,
    });
  };

  if (oauthError) {
    logGitHubAuthError("oauth_provider_error");
    const response = NextResponse.redirect(failedUrl);
    clearAuthCookies(response);
    return response;
  }

  if (!code && !(tokenHash && type)) {
    logGitHubAuthError("missing_code");
    const response = NextResponse.redirect(failedUrl);
    clearAuthCookies(response);
    return response;
  }

  const response = NextResponse.redirect(`${origin}${nextPath}`);
  const supabase = createClient(request, response);

  try {
    if (code) {
      const { data: exchangeData, error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        logGitHubAuthError("exchange_code_failed", {
          error: exchangeError,
          sessionUser: exchangeData?.user ?? null,
        });
        const failed = NextResponse.redirect(failedUrl);
        clearAuthCookies(failed);
        return failed;
      }
    } else if (tokenHash && type) {
      const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as EmailOtpType,
      });
      if (otpError) {
        logGitHubAuthError("verify_otp_failed", {
          error: otpError,
          sessionUser: otpData?.user ?? null,
        });
        const failed = NextResponse.redirect(failedUrl);
        clearAuthCookies(failed);
        return failed;
      }
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      logGitHubAuthError("get_user_failed", {
        error: userError,
        sessionUser: userData?.user ?? null,
      });
    }

    const identities =
      userData.user?.identities?.map((identity) => ({
        provider: identity.provider,
        identity_id: identity.identity_id,
        email: (identity.identity_data as { email?: string } | undefined)?.email,
      })) ?? [];

    console.info("DEBUG GITHUB AUTH SUCCESS:", {
      userId: userData.user?.id ?? null,
      email: userData.user?.email ?? null,
      identities,
      nextPath,
      providers: (userData.user?.app_metadata as { providers?: unknown } | undefined)
        ?.providers,
    });

    await syncGitHubIdentityToProfile(supabase, userData.user);
  } catch (caught) {
    let sessionUser: unknown = null;
    try {
      const { data } = await supabase.auth.getUser();
      sessionUser = data.user;
    } catch {
      // ignore secondary lookup failures
    }
    logGitHubAuthError("callback_exception", {
      error: caught,
      sessionUser,
    });
    const failed = NextResponse.redirect(failedUrl);
    clearAuthCookies(failed);
    return failed;
  }

  clearAuthCookies(response);
  return response;
}
