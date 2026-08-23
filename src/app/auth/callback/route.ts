import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminUser } from "@/lib/admin-access";

const DEFAULT_NEXT = "/dashboard";

const cookieOptions = {
  path: "/",
  sameSite: "lax" as const,
};

function sanitizeNext(value: string | null): string {
  if (!value || !value.startsWith("/")) {
    return DEFAULT_NEXT;
  }

  return value;
}

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

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const nextParam = searchParams.get("next");
  const next = sanitizeNext(nextParam);

  let response = NextResponse.redirect(buildRedirectUrl(request, origin, next));

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

  let authErrorMessage: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (!nextParam) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const destination = isAdminUser(user) ? "/admin" : "/dashboard";
        const nextResponse = NextResponse.redirect(
          buildRedirectUrl(request, origin, destination)
        );
        copyResponseCookies(response, nextResponse);
        return nextResponse;
      }

      return response;
    }

    authErrorMessage = error.message;
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });

    if (!error) {
      return response;
    }

    authErrorMessage = error.message;
  }

  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set(
    "error",
    authErrorMessage ?? "Authentication callback failed."
  );
  return NextResponse.redirect(loginUrl.toString());
}
