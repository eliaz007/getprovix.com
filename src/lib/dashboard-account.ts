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

const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/employer",
  "/pitch-studio",
  "/simulator",
  "/profile-studio",
  "/intro-requests",
] as const;

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
    isDashboardAuditorPath(pathname)
  );
}

export function isOpportunitiesPath(pathname: string): boolean {
  return pathname === "/opportunities" || pathname.startsWith("/opportunities/");
}

export function isPublicOpportunitiesPath(pathname: string): boolean {
  return isOpportunitiesPath(pathname);
}

export function isProtectedAppPath(pathname: string): boolean {
  if (isPublicAuditorPath(pathname) || isPublicOpportunitiesPath(pathname)) {
    return false;
  }

  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isInterviewPrepPath(pathname: string): boolean {
  return (
    pathname === "/dashboard/interview-prep" ||
    pathname === "/dashboard/interview-simulator"
  );
}
