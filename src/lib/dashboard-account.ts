export type DashboardTab =
  | "my_profile"
  | "opportunities"
  | "intro_requests"
  | "essay-studio"
  | "aid-appeals"
  | "college-fit"
  | "opportunity_radar"
  | "applications"
  | "talent"
  | "evaluator"
  | "revenue";

export function isEmployerRole(role: string | null | undefined): boolean {
  return role === "employer" || role === "business";
}

export function isEmployeeRole(role: string | null | undefined): boolean {
  return role === "employee";
}

export function canAccessTalentPool(role: string | null | undefined): boolean {
  if (!role || role === "employee" || role === "candidate") {
    return false;
  }
  return isEmployerRole(role);
}

export function isDashboardRootPath(pathname: string): boolean {
  return pathname === "/dashboard";
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

export function isPublicAuditorPath(pathname: string): boolean {
  return (
    pathname === "/audits" ||
    pathname.startsWith("/audits/") ||
    isDashboardAuditorPath(pathname)
  );
}

export function isAuditorPath(pathname: string): boolean {
  return isPublicAuditorPath(pathname);
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
