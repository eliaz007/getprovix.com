/** Tiny client-safe helper — keep this free of Supabase/account-role imports. */
export function loginHrefForSignupRole(kind: "employer" | "developer"): string {
  return kind === "employer" ? "/login?role=employer" : "/login?role=developer";
}
