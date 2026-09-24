import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // Homepage must never pay for session refresh or the Supabase middleware module.
  if (request.nextUrl.pathname === "/") {
    return NextResponse.next();
  }

  const { updateSession } = await import("@/utils/supabase/middleware");
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Auth/session refresh runs only on protected app paths.
     * Skip:
     * - `/` and marketing/legal pages (login, pricing, privacy, terms, audit)
     * - _next/static, _next/image, favicon, and common static extensions
     * - public /api routes (those handlers authenticate themselves)
     * - /auth/callback (OAuth code exchange owns the session cookies)
     *
     * /api/intros and other listed APIs still refresh the session.
     * Unsigned app-shell routes redirect to /. Matched /api routes never HTML-redirect.
     */
    "/((?!_next/static|_next/image|favicon.ico|api|auth/callback|login(?:/|$)|privacy(?:/|$)|terms(?:/|$)|pricing(?:/|$)|update-password(?:/|$)|audit(?:/|$)|p(?:/|$)|robots\\.txt|sitemap\\.xml|$).*)",
    "/api/intros/:path*",
    "/api/profile/:path*",
    "/api/talent-pool/:path*",
    "/api/jobs/:path*",
    "/api/verify-repo",
    "/api/verify-repo/:path*",
    "/api/verify-token",
    "/api/verify-token/:path*",
  ],
};
