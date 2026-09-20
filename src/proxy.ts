import type { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on page/API routes that need session refresh — never on:
     * - _next/* (static chunks, image optimizer, _next/data, HMR, etc.)
     * - favicon / common static asset extensions
     * - /api by default (re-include specific mutating APIs below)
     *
     * Career Accelerator dashboard tools are additionally short-circuited
     * inside updateSession so soft navigations never await getUser().
     *
     * Public pages: /, /login, /pricing, /privacy, /terms, /audit
     * Unsigned app-shell routes redirect to /. Signed-in visits to /
     * redirect to /dashboard. Matched /api routes never HTML-redirect.
     */
    "/((?!_next/|favicon.ico|api(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff2?)$).*)",
    "/api/intros/:path*",
    "/api/profile/:path*",
    "/api/talent-pool/:path*",
    "/api/jobs/:path*",
    "/api/verify-repo",
    "/api/verify-repo/:path*",
  ],
};
