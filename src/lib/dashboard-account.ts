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

export function isAuditorPath(pathname: string): boolean {
  return (
    pathname === "/dashboard/auditor" ||
    pathname === "/dashboard/resume-auditor"
  );
}

export function isInterviewPrepPath(pathname: string): boolean {
  return (
    pathname === "/dashboard/interview-prep" ||
    pathname === "/dashboard/interview-simulator"
  );
}
