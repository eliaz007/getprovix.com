export type DashboardTab =
  | "my_profile"
  | "opportunities"
  | "intro_requests"
  | "essay-studio"
  | "aid-appeals"
  | "college-fit"
  | "opportunity_radar"
  | "applications"
  | "applicants"
  | "talent"
  | "evaluator"
  | "auditor";

export function isEmployerRole(role: string | null | undefined): boolean {
  return role === "employer" || role === "business";
}

export function isEmployeeRole(role: string | null | undefined): boolean {
  return role === "employee";
}

export function isVerifiedEmployerFlag(
  isVerified: boolean | null | undefined
): boolean {
  return isVerified === true;
}

export function canAccessTalentPool(
  role: string | null | undefined,
  isVerified?: boolean | null
): boolean {
  if (!isEmployerRole(role)) {
    return false;
  }
  return isVerifiedEmployerFlag(isVerified);
}

export function isDashboardRootPath(pathname: string): boolean {
  return pathname === "/dashboard";
}

/**
 * Only the heavy Profile Studio root holds the full dashboard chrome until
 * first content paints. Nested accelerator routes (Pitch Studio, Auditor,
 * Interview Prep, etc.) mount their own Suspense/skeletons and must not
 * block the shared shell on an unmarked contentReady flag.
 */
export function dashboardRouteHoldsChromeUntilContent(
  pathname: string
): boolean {
  return isDashboardRootPath(pathname);
}

export function defaultDashboardTabForRole(
  role: string | null | undefined
): DashboardTab {
  return isEmployerRole(role) ? "talent" : "my_profile";
}

export function dashboardTabHref(tab: DashboardTab): string {
  if (tab === "opportunities") {
    return "/opportunities";
  }
  if (tab === "my_profile") {
    return "/dashboard";
  }
  return `/dashboard?tab=${encodeURIComponent(tab)}`;
}

const SEARCH_DASHBOARD_TABS = [
  "my_profile",
  "intro_requests",
  "opportunity_radar",
  "applications",
  "applicants",
  "talent",
  "evaluator",
  "auditor",
  "essay-studio",
  "aid-appeals",
  "college-fit",
] as const satisfies readonly DashboardTab[];

export function dashboardTabFromSearchParam(
  tab: string | null | undefined
): DashboardTab | null {
  if (!tab) {
    return null;
  }

  return SEARCH_DASHBOARD_TABS.find((value) => value === tab) ?? null;
}

export function resolveDashboardTabFromLocation(
  pathname: string,
  tabParam?: string | null
): DashboardTab | null {
  if (isOpportunitiesPath(pathname)) {
    return "opportunities";
  }
  if (isAuditorPath(pathname)) {
    return "auditor";
  }
  if (!isDashboardRootPath(pathname)) {
    return null;
  }

  return dashboardTabFromSearchParam(tabParam) ?? null;
}

export function isPitchStudioPath(pathname: string): boolean {
  return pathname === "/dashboard/pitch-studio";
}

export function isDashboardAuditorPath(pathname: string): boolean {
  return (
    pathname === "/dashboard/auditor" ||
    pathname.startsWith("/dashboard/auditor/") ||
    pathname === "/dashboard/resume-auditor"
  );
}

export function isStandalonePublicAuditPath(pathname: string): boolean {
  return pathname === "/audit" || pathname.startsWith("/audit/");
}

export function isPublicAuditorPath(pathname: string): boolean {
  return (
    isStandalonePublicAuditPath(pathname) ||
    pathname === "/audits" ||
    pathname.startsWith("/audits/") ||
    isDashboardAuditorPath(pathname)
  );
}

export function isAuditorPath(pathname: string): boolean {
  return (
    pathname === "/audits" ||
    pathname.startsWith("/audits/") ||
    pathname === "/auditor" ||
    pathname.startsWith("/auditor/") ||
    isDashboardAuditorPath(pathname)
  );
}

export function isOpportunitiesPath(pathname: string): boolean {
  return pathname === "/opportunities" || pathname.startsWith("/opportunities/");
}

export function isPublicOpportunitiesPath(pathname: string): boolean {
  return false;
}

const PUBLIC_EXACT_PATHS = new Set([
  "/",
  "/login",
  "/privacy",
  "/terms",
  "/pricing",
  "/update-password",
  "/admin/login",
  "/icon",
  "/apple-icon",
  "/opengraph-image",
  "/robots.txt",
  "/sitemap.xml",
]);

const PUBLIC_PREFIXES = [
  "/login/",
  "/auth/",
  "/p/",
  "/update-password/",
  "/admin/login/",
  "/audit/",
] as const;

/** Marketing, legal, auth, and the standalone public audit. Not the app shell. */
export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(pathname)) {
    return true;
  }

  if (pathname === "/audit") {
    return true;
  }

  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** App-shell and other internal pages. Unsigned visitors are sent to /. */
export function isProtectedAppPath(pathname: string): boolean {
  return !isPublicRoute(pathname);
}

export function isInterviewPrepPath(pathname: string): boolean {
  return (
    pathname === "/dashboard/interview-prep" ||
    pathname === "/dashboard/interview-simulator"
  );
}

/** Pitch Studio, Auditor, and Interview Simulator — client-gated tool UIs. */
export function isCareerAcceleratorPath(pathname: string): boolean {
  return (
    isPitchStudioPath(pathname) ||
    isDashboardAuditorPath(pathname) ||
    isInterviewPrepPath(pathname)
  );
}
