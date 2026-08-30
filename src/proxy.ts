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
     * Public pages: /audits, /opportunities
     * Protected: /dashboard, /pitch-studio, /simulator,
     * /profile-studio, /intro-requests, /employer
     */
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/api/intros/:path*",
    "/api/talent-pool/:path*",
    "/api/jobs/:path*",
  ],
};
