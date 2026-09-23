import type { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all routes except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - /api (public API routes such as /api/audit)
     * - common static image extensions
     *
     * /api/intros is included so employer intro requests refresh the session.
     *
     * Public pages: /, /login, /pricing, /privacy, /terms, /audit
     * Unsigned app-shell routes redirect to /. Signed-in visits to /
     * redirect to /dashboard. Matched /api routes never HTML-redirect.
     */
    "/((?!_next/static|_next/image|favicon.ico|api|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/api/intros/:path*",
    "/api/profile/:path*",
    "/api/talent-pool/:path*",
    "/api/jobs/:path*",
    "/api/verify-repo",
    "/api/verify-repo/:path*",
  ],
};
