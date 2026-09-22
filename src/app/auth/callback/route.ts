import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminUser } from "@/lib/admin-access";
import {
  normalizeAccountKind,
  resolvePostAuthDestination,
  ROLE_ONBOARDING_PATH,
} from "@/lib/account-role";
import { EMPLOYER_SIGNUP_COOKIE } from "@/lib/google-auth";

const cookieOptions = {
  path: "/",
  sameSite: "lax" as const,
};

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

/**
 * Forward every Set-Cookie from the Supabase SSR response onto the redirect.
 * Dropping options (httpOnly/secure/maxAge) causes the first OAuth hop to
 * land without a readable session — middleware then bounces unsigned users to /.
 */
function copyResponseCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set({
      name: cookie.name,
      value: cookie.value,
      path: cookie.path ?? cookieOptions.path,
      domain: cookie.domain,
      expires: cookie.expires,
      maxAge: cookie.maxAge,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite ?? cookieOptions.sameSite,
    });
  });

  for (const header of ["cache-control", "expires", "pragma"] as const) {
    const value = from.headers.get(header);
    if (value) {
      to.headers.set(header, value);
    }
  }
}

function applyTrackedCookies(
  target: NextResponse,
  cookiesToSet: CookieToSet[]
) {
  cookiesToSet.forEach(({ name, value, options }) => {
    target.cookies.set(name, value, {
      ...cookieOptions,
      ...options,
    });
  });
}

function buildRedirectUrl(request: NextRequest, origin: string, path: string) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";

  if (!isLocalEnv && forwardedHost) {
    return `https://${forwardedHost}${path}`;
  }

  return `${origin}${path}`;
}

function redirectWithSessionCookies(
  request: NextRequest,
  origin: string,
  path: string,
  sessionResponse: NextResponse,
  trackedCookies: CookieToSet[]
) {
  const nextResponse = NextResponse.redirect(
    buildRedirectUrl(request, origin, path)
  );
  // Prefer the explicit jar written during exchange/setAll, then merge any
  // remaining response cookies so nothing is dropped on the redirect hop.
  applyTrackedCookies(nextResponse, trackedCookies);
  copyResponseCookies(sessionResponse, nextResponse);
  return nextResponse;
}

function profileRoleValue(role: unknown): string | null {
  return typeof role === "string" && role.trim() ? role : null;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const nextParam = searchParams.get("next");

  let response = NextResponse.next({ request });
  const trackedCookies: CookieToSet[] = [];

  const supabase = createServerClient(
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
            trackedCookies.push({ name, value, options });
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

  let authenticated = false;
  let authErrorMessage: string | null = null;
  let sessionUser: User | null = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      authErrorMessage = error.message;
    } else if (!data.session?.user) {
      authErrorMessage = "Authentication callback did not return a session.";
    } else {
      // Flush deferred cookie writes from the exchange before we redirect.
      await Promise.resolve();
      authenticated = true;
      sessionUser = data.session.user;
    }
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error) {
      authErrorMessage = error.message;
    } else if (!data.session?.user && !data.user) {
      authErrorMessage = "OTP verification did not return a session.";
    } else {
      await Promise.resolve();
      authenticated = true;
      sessionUser = data.session?.user ?? data.user ?? null;
    }
  }

  if (!authenticated || !sessionUser) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set(
      "error",
      authErrorMessage ?? "Authentication callback failed."
    );
    return NextResponse.redirect(loginUrl.toString());
  }

  const userId = sessionUser.id;

  let role: string | null = null;

  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    role = profileRoleValue(profile?.role);

    if (!role) {
      const { data: linkedProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      role = profileRoleValue(linkedProfile?.role);
    }
  }

  const assignedRole = normalizeAccountKind(role);
  const requestedNext =
    nextParam &&
    nextParam.startsWith("/") &&
    !nextParam.startsWith("//") &&
    !nextParam.includes("\\")
      ? nextParam
      : "/dashboard";
  const destination =
    !assignedRole && !isAdminUser(sessionUser)
      ? ROLE_ONBOARDING_PATH
      : resolvePostAuthDestination({
          role: assignedRole,
          requestedNext,
          isAdmin: isAdminUser(sessionUser),
        });

  const nextResponse = redirectWithSessionCookies(
    request,
    origin,
    destination,
    response,
    trackedCookies
  );
  nextResponse.cookies.set(EMPLOYER_SIGNUP_COOKIE, "", {
    path: "/",
    maxAge: 0,
  });
  return nextResponse;
}
