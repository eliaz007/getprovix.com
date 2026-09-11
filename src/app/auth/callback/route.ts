import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminUser } from "@/lib/admin-access";
import {
  isEmployerSignup,
  normalizeAccountKind,
  resolvePostAuthDestination,
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

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      authErrorMessage = error.message;
    } else {
      authenticated = true;
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

  const employerIntent =
    request.cookies.get(EMPLOYER_SIGNUP_COOKIE)?.value === "employer";
  let role: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    role =
      (typeof profile?.role === "string" ? profile.role : null) ??
      (typeof user.user_metadata?.role === "string"
        ? user.user_metadata.role
        : null);

    if (
      (isEmployerSignup(user) || employerIntent) &&
      normalizeAccountKind(role) !== "employer"
    ) {
      await supabase.auth.updateUser({
        data: { role: "employer", account_type: "business" },
      });
      await supabase.from("profiles").upsert(
        {
          id: user.id,
          role: "employer",
          is_visible_in_pool: false,
          is_verified: false,
          ...(user.email
            ? { email: user.email, contact_email: user.email }
            : {}),
        },
        { onConflict: "id" }
      );
      role = "employer";
    }
  }

  const destination = resolvePostAuthDestination({
    role: employerIntent || (user && isEmployerSignup(user)) ? "employer" : role,
    requestedNext: nextParam,
    isAdmin: isAdminUser(user),
  });

  const nextResponse = redirectWithCookies(request, origin, destination, response);
  if (employerIntent) {
    nextResponse.cookies.set(EMPLOYER_SIGNUP_COOKIE, "", {
      path: "/",
      maxAge: 0,
    });
  }
  return nextResponse;
}
