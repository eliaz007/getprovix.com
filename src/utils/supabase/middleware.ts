import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminUser } from "@/lib/admin-access";
import {
  isAuditorPath,
  isProtectedAppPath,
  isPublicRoute,
} from "@/lib/dashboard-account";
import {
  EMPLOYER_DASHBOARD_PATH,
  isEmployerAllowedDashboardRequest,
  isEmployerDashboardRequest,
  isRoleOnboardingPath,
  normalizeAccountKind,
  resolvePostAuthDestination,
  ROLE_ONBOARDING_PATH,
} from "@/lib/account-role";

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
  pathname: string,
  search = ""
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = search;
  const redirectResponse = NextResponse.redirect(url, 303);
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // API routes must always return JSON. A redirect to the marketing page
  // follows to HTML, and response.json() then throws on "<!DOCTYPE".
  // Route handlers authenticate (cookie or bearer) and return { error }.
  if (pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  const isLogin =
    pathname === "/login" || pathname.startsWith("/login/");
  const isHome = pathname === "/";
  const isUpdatePassword =
    pathname === "/update-password" ||
    pathname.startsWith("/update-password/");
  const isEmployer =
    pathname === "/employer" || pathname.startsWith("/employer/");
  const isProtectedRoute = isProtectedAppPath(pathname);

  // Unauthenticated users must be allowed to stay on /login (no redirect).
  if (isLogin && !user) {
    return supabaseResponse;
  }

  if (isUpdatePassword) {
    return supabaseResponse;
  }

  // Unsigned visitors never enter the app shell. Send them to the marketing page.
  if (!user && isProtectedRoute && !isPublicRoute(pathname)) {
    return redirectWithSessionCookies(request, supabaseResponse, "/");
  }

  if (user) {
    const employerRequest = isEmployerDashboardRequest(
      pathname,
      request.nextUrl.search
    );
    const onRoleOnboarding = isRoleOnboardingPath(pathname);
    const needsRole =
      isHome ||
      isLogin ||
      isEmployer ||
      employerRequest ||
      isAuditorPath(pathname) ||
      onRoleOnboarding ||
      (isProtectedRoute && !isLogin);

    let role: ReturnType<typeof normalizeAccountKind> = null;

    if (needsRole) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        role = normalizeAccountKind(
          typeof profile?.role === "string" ? profile.role : null
        );

        if (!role) {
          const { data: linkedProfile } = await supabase
            .from("profiles")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();
          role = normalizeAccountKind(
            typeof linkedProfile?.role === "string" ? linkedProfile.role : null
          );
        }
      } catch (err) {
        console.error("Account role check failed:", err);
      }

      if (
        !role &&
        !isAdminUser(user) &&
        !onRoleOnboarding &&
        !isLogin &&
        (isProtectedRoute || isHome)
      ) {
        return redirectWithSessionCookies(
          request,
          supabaseResponse,
          ROLE_ONBOARDING_PATH
        );
      }

      if (role && onRoleOnboarding) {
        const destination = new URL(
          role === "employer" ? EMPLOYER_DASHBOARD_PATH : "/dashboard",
          request.url
        );
        return redirectWithSessionCookies(
          request,
          supabaseResponse,
          destination.pathname,
          destination.search
        );
      }

      if (isLogin) {
        const destination = new URL(
          resolvePostAuthDestination({
            role,
            requestedNext: request.nextUrl.searchParams.get("next"),
            isAdmin: isAdminUser(user),
          }),
          request.url
        );
        if (
          destination.pathname !== "/login" &&
          !destination.pathname.startsWith("/login/")
        ) {
          return redirectWithSessionCookies(
            request,
            supabaseResponse,
            destination.pathname,
            destination.search
          );
        }
      }

      const isEmployerAccount = role === "employer";

      if (
        isEmployerAccount &&
        pathname === "/dashboard" &&
        !isEmployerAllowedDashboardRequest(pathname, request.nextUrl.search)
      ) {
        const destination = new URL(EMPLOYER_DASHBOARD_PATH, request.url);
        return redirectWithSessionCookies(
          request,
          supabaseResponse,
          destination.pathname,
          destination.search
        );
      }

      if (isEmployerAccount && (isHome || isAuditorPath(pathname))) {
        const destination = new URL(EMPLOYER_DASHBOARD_PATH, request.url);
        return redirectWithSessionCookies(
          request,
          supabaseResponse,
          destination.pathname,
          destination.search
        );
      }

      // Bare /employer → talent home (nested /employer/* pages stay put).
      if (
        isEmployerAccount &&
        (pathname === "/employer" || pathname === "/employer/")
      ) {
        const destination = new URL(EMPLOYER_DASHBOARD_PATH, request.url);
        return redirectWithSessionCookies(
          request,
          supabaseResponse,
          destination.pathname,
          destination.search
        );
      }

      if (!isEmployerAccount && (isEmployer || employerRequest)) {
        return redirectWithSessionCookies(
          request,
          supabaseResponse,
          "/dashboard"
        );
      }
    }
  }

  // Signed-in candidates: /auditor and /audits belong in the dashboard auditor.
  if (user && isAuditorPath(pathname) && !pathname.startsWith("/dashboard/")) {
    return redirectWithSessionCookies(
      request,
      supabaseResponse,
      "/dashboard/auditor",
      request.nextUrl.search
    );
  }

  // Home only: active session → candidate dashboard. Employers already left above.
  if (isHome && user) {
    if (request.nextUrl.searchParams.get("passwordUpdated") === "1") {
      return supabaseResponse;
    }

    return redirectWithSessionCookies(request, supabaseResponse, "/dashboard");
  }

  return supabaseResponse;
}
