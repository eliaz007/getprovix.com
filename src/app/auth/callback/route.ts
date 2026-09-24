import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
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

function successPath(nextParam: string | null) {
  // Password-recovery emails land here with next=/update-password.
  // Google OAuth always continues to /dashboard.
  if (
    nextParam === "/update-password" ||
    nextParam?.startsWith("/update-password?")
  ) {
    return "/update-password";
  }

  return "/dashboard";
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
  const { searchParams } = new URL(request.url);
  const origin = resolveOrigin(request);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const failedUrl = `${origin}/login?error=auth_failed`;

  if (!code && !(tokenHash && type)) {
    console.error("OAuth exchange error:", "missing code");
    return NextResponse.redirect(failedUrl);
  }

  const response = NextResponse.redirect(
    `${origin}${successPath(searchParams.get("next"))}`
  );
  const supabase = createClient(request, response);

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("OAuth exchange error:", error);
        return NextResponse.redirect(failedUrl);
      }
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as EmailOtpType,
      });
      if (error) {
        console.error("OAuth exchange error:", error);
        return NextResponse.redirect(failedUrl);
      }
    }

    const { data: userData } = await supabase.auth.getUser();
    await syncGitHubIdentityToProfile(supabase, userData.user);
  } catch (error) {
    console.error("OAuth exchange error:", error);
    return NextResponse.redirect(failedUrl);
  }

  response.cookies.set(EMPLOYER_SIGNUP_COOKIE, "", {
    path: "/",
    maxAge: 0,
  });
  return response;
}
