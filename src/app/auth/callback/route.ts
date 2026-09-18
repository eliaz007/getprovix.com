import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
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

function copyResponseCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
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

function redirectWithCookies(
  request: NextRequest,
  origin: string,
  path: string,
  sessionResponse: NextResponse
) {
  const nextResponse = NextResponse.redirect(
    buildRedirectUrl(request, origin, path)
  );
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
            response.cookies.set(name, value, {
              ...cookieOptions,
              ...options,
            });
          });
        },
      },
    }
  );

  let authenticated = false;
  let authErrorMessage: string | null = null;
  let sessionUserId: string | null = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      authErrorMessage = error.message;
    } else {
      authenticated = true;
      sessionUserId = data.session?.user.id ?? null;
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error) {
      authErrorMessage = error.message;
    } else {
      authenticated = true;
    }
  }

  if (!authenticated) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set(
      "error",
      authErrorMessage ?? "Authentication callback failed."
    );
    return NextResponse.redirect(loginUrl.toString());
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = sessionUserId ?? user?.id ?? null;

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
  const destination =
    !assignedRole && !isAdminUser(user)
      ? ROLE_ONBOARDING_PATH
      : resolvePostAuthDestination({
          role: assignedRole,
          requestedNext: nextParam,
          isAdmin: isAdminUser(user),
        });

  const nextResponse = redirectWithCookies(
    request,
    origin,
    destination,
    response
  );
  nextResponse.cookies.set(EMPLOYER_SIGNUP_COOKIE, "", {
    path: "/",
    maxAge: 0,
  });
  return nextResponse;
}
