import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const cookieOptions = {
  path: "/",
  sameSite: "lax" as const,
};

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

  // Supabase may attach cache headers when refreshing tokens — keep them in sync.
  for (const header of ["cache-control", "expires", "pragma"] as const) {
    const value = from.headers.get(header);
    if (value) {
      to.headers.set(header, value);
    }
  }
}

function redirectWithSessionCookies(
  request: NextRequest,
  supabaseResponse: NextResponse,
  pathname: string
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirectResponse = NextResponse.redirect(url);
  copyResponseCookies(supabaseResponse, redirectResponse);
  return redirectResponse;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

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
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...cookieOptions,
              ...options,
            })
          );
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              supabaseResponse.headers.set(key, value);
            });
          }
        },
      },
    }
  );

  // Refresh the auth session so expired tokens are renewed before route checks.
  await supabase.auth.getSession();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isDashboard =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isLogin =
    pathname === "/login" || pathname.startsWith("/login/");
  const isHome = pathname === "/";
  const isUpdatePassword =
    pathname === "/update-password" ||
    pathname.startsWith("/update-password/");
  const isEmployer =
    pathname === "/employer" || pathname.startsWith("/employer/");

  // Unauthenticated users must be allowed to stay on /login (no redirect).
  if (isLogin && !user) {
    return supabaseResponse;
  }

  if (isUpdatePassword) {
    return supabaseResponse;
  }

  // Protected routes: no session → login (cookies still copied on redirect).
  if (isDashboard && !user) {
    return redirectWithSessionCookies(request, supabaseResponse, "/login");
  }

  if (isEmployer) {
    if (!user) {
      return redirectWithSessionCookies(request, supabaseResponse, "/login");
    }

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      const role = profile?.role ?? user.user_metadata?.role;
      if (role === "candidate") {
        return redirectWithSessionCookies(
          request,
          supabaseResponse,
          "/dashboard"
        );
      }
    } catch (err) {
      console.error("Employer role check failed:", err);
    }

    return supabaseResponse;
  }

  // Home only: active session → dashboard. /login stays put so users can choose.
  if (isHome && user) {
    if (request.nextUrl.searchParams.get("passwordUpdated") === "1") {
      return supabaseResponse;
    }

    return redirectWithSessionCookies(request, supabaseResponse, "/dashboard");
  }

  return supabaseResponse;
}
