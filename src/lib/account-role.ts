import type { User } from "@supabase/supabase-js";

export type AccountKind = "employer" | "candidate";

/** Employer hiring home: vetted talent pipeline, not the candidate profile. */
export const EMPLOYER_DASHBOARD_PATH = "/dashboard?tab=talent";

/** Candidate dashboard home. */
export const CANDIDATE_DASHBOARD_PATH = "/dashboard/profile";

/** Post-auth role picker for GitHub/Google users whose profiles.role is unset. */
export const ROLE_ONBOARDING_PATH = "/onboarding/role";

const EMPLOYER_ONLY_TABS = new Set(["talent", "applicants", "evaluator"]);

/** Tabs an employer may keep on /dashboard. Bare /dashboard is not included. */
const EMPLOYER_ALLOWED_DASHBOARD_TABS = new Set([
  "talent",
  "applicants",
  "evaluator",
  "auditor",
  "my_profile",
]);

export function normalizeAccountKind(
  role: string | null | undefined
): AccountKind | null {
  const value = role?.trim().toLowerCase();
  if (!value) {
    return null;
  }

  if (value === "employer" || value === "business") {
    return "employer";
  }

  if (value === "candidate" || value === "employee") {
    return "candidate";
  }

  return null;
}

export function resolveAccountRole(
  profileRole: string | null | undefined,
  userOrMetadataRole: User | unknown | null
): string | null {
  const fromProfile = profileRole?.trim() || null;

  const metadataRole =
    userOrMetadataRole && typeof userOrMetadataRole === "object"
      ? (userOrMetadataRole as User).user_metadata?.role
      : userOrMetadataRole;

  const fromMeta =
    typeof metadataRole === "string" ? metadataRole.trim() : null;

  const normalizedProfile = normalizeAccountKind(fromProfile);
  const normalizedMeta = normalizeAccountKind(fromMeta);

  if (normalizedProfile) {
    return normalizedProfile;
  }

  if (fromProfile) {
    return fromProfile;
  }

  if (normalizedMeta) {
    return normalizedMeta;
  }

  return fromMeta;
}

export function signupRoleFromSearch(
  search: string
): "employer" | "developer" | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  const role = params.get("role")?.trim().toLowerCase() ?? "";

  if (
    role === "employer" ||
    role === "business" ||
    role === "founder" ||
    isEmployerAuthIntent(search)
  ) {
    return "employer";
  }

  if (role === "developer" || role === "candidate") {
    return "developer";
  }

  return null;
}

export { loginHrefForSignupRole } from "@/lib/login-href";

export function isEmployerAuthIntent(search: string): boolean {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  const role = params.get("role")?.trim().toLowerCase() ?? "";
  if (role === "employer" || role === "business") {
    return true;
  }

  const nextPath = (params.get("next")?.trim() ?? "").split("?")[0] ?? "";
  return nextPath === "/employer" || nextPath.startsWith("/employer/");
}

export function isEmployerAllowedDashboardRequest(
  pathname: string,
  search = ""
): boolean {
  if (pathname === "/employer" || pathname.startsWith("/employer/")) {
    return true;
  }

  if (
    pathname === "/dashboard/auditor" ||
    pathname.startsWith("/dashboard/auditor/")
  ) {
    return true;
  }

  if (pathname !== "/dashboard") {
    return false;
  }

  const tab = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  )
    .get("tab")
    ?.trim()
    .toLowerCase();

  return Boolean(tab && EMPLOYER_ALLOWED_DASHBOARD_TABS.has(tab));
}

export function isEmployerDashboardRequest(
  pathname: string,
  search = ""
): boolean {
  if (pathname === "/employer" || pathname.startsWith("/employer/")) {
    return true;
  }

  if (pathname !== "/dashboard") {
    return false;
  }

  const tab = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  )
    .get("tab")
    ?.trim()
    .toLowerCase();

  return Boolean(tab && EMPLOYER_ONLY_TABS.has(tab));
}

export function isCandidateShellPath(pathname: string, search = ""): boolean {
  if (
    pathname === "/dashboard/auditor" ||
    pathname.startsWith("/dashboard/auditor/") ||
    pathname === "/audits" ||
    pathname.startsWith("/audits/") ||
    pathname === "/auditor" ||
    pathname.startsWith("/auditor/") ||
    pathname === "/dashboard/pitch-studio" ||
    pathname === "/dashboard/interview-prep" ||
    pathname === "/dashboard/interview-simulator" ||
    pathname === "/dashboard/profile"
  ) {
    return true;
  }

  return pathname === "/dashboard" && !isEmployerDashboardRequest(pathname, search);
}

export function isRoleOnboardingPath(pathname: string): boolean {
  return pathname === ROLE_ONBOARDING_PATH || pathname.startsWith(`${ROLE_ONBOARDING_PATH}/`);
}

export function resolvePostAuthDestination(input: {
  role: string | null | undefined;
  requestedNext?: string | null;
  isAdmin?: boolean;
}): string {
  if (input.isAdmin) {
    return "/admin";
  }

  const kind = normalizeAccountKind(input.role);
  if (!kind) {
    return ROLE_ONBOARDING_PATH;
  }

  const requested = sanitizeInternalPath(input.requestedNext);
  const requestedUrl = requested
    ? new URL(requested, "https://getprovix.com")
    : null;
  const employer = kind === "employer";
  const defaultDestination = employer
    ? EMPLOYER_DASHBOARD_PATH
    : CANDIDATE_DASHBOARD_PATH;

  if (
    !requestedUrl ||
    requestedUrl.pathname === "/" ||
    isRoleOnboardingPath(requestedUrl.pathname)
  ) {
    return defaultDestination;
  }

  if (employer && isCandidateShellPath(requestedUrl.pathname, requestedUrl.search)) {
    return EMPLOYER_DASHBOARD_PATH;
  }

  if (
    !employer &&
    isEmployerDashboardRequest(requestedUrl.pathname, requestedUrl.search)
  ) {
    return CANDIDATE_DASHBOARD_PATH;
  }

  return `${requestedUrl.pathname}${requestedUrl.search}`;
}

function sanitizeInternalPath(value: string | null | undefined): string | null {
  const next = value?.trim() ?? "";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return null;
  }

  return next;
}

export function isEmployerSignup(user: User | null | undefined): boolean {
  return (
    normalizeAccountKind(
      typeof user?.user_metadata?.role === "string"
        ? user.user_metadata.role
        : null
    ) === "employer"
  );
}

export function profileDefaultsForAccountRole(
  role: string | null | undefined
): { role: AccountKind | null; is_visible_in_pool: boolean } {
  const kind = normalizeAccountKind(role);
  if (kind === "employer") {
    return { role: "employer", is_visible_in_pool: false };
  }

  if (kind === "candidate") {
    return { role: "candidate", is_visible_in_pool: false };
  }

  return { role: null, is_visible_in_pool: false };
}

export function signupMetadataForKind(
  kind: "candidate" | "business",
  input: { first_name: string; last_name: string }
): Record<string, string> {
  return {
    role: kind === "business" ? "employer" : "candidate",
    account_type: kind,
    first_name: input.first_name,
    last_name: input.last_name,
  };
}

export async function syncEmployerProfileAfterSignup(
  supabase: {
    from: (
      table: string
    ) => {
      upsert: (
        values: Record<string, unknown>,
        options: { onConflict: string }
      ) => PromiseLike<{ error: { message?: string } | null }>;
    };
  },
  userId: string,
  email?: string | null
): Promise<void> {
  const workEmail = email?.trim() || null;
  const payload: Record<string, unknown> = {
    id: userId,
    role: "employer",
    is_visible_in_pool: false,
    is_verified: false,
  };

  if (workEmail) {
    payload.email = workEmail;
    payload.contact_email = workEmail;
  }

  const { error } = await supabase.from("profiles").upsert(payload, {
    onConflict: "id",
  });

  if (error) {
    console.warn("Employer profile sync after signup failed:", error.message);
  }
}

type AuthMetadataClient = {
  auth: {
    updateUser: (attributes: {
      data: Record<string, string>;
    }) => Promise<{ error: { message?: string } | null }>;
  };
};

/** Write role: employer onto auth metadata and the profiles row. */
export async function persistEmployerAccount(
  supabase: Parameters<typeof syncEmployerProfileAfterSignup>[0] &
    AuthMetadataClient,
  userId: string,
  email?: string | null
): Promise<void> {
  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      role: "employer",
      account_type: "business",
    },
  });

  if (metadataError) {
    console.warn("Employer metadata update failed:", metadataError.message);
  }

  await syncEmployerProfileAfterSignup(supabase, userId, email);
}

/** Read only profiles.role — metadata is not a substitute for Pattern 2 onboarding. */
export async function loadProfileAccountKind(
  supabase: unknown,
  userId: string
): Promise<AccountKind | null> {
  const client = supabase as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string
        ) => {
          maybeSingle: () => PromiseLike<{
            data: { role?: string | null } | null;
          }>;
        };
      };
    };
  };

  const { data: byId } = await client
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const fromId = normalizeAccountKind(
    typeof byId?.role === "string" ? byId.role : null
  );
  if (fromId) {
    return fromId;
  }

  const { data: byUserId } = await client
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  return normalizeAccountKind(
    typeof byUserId?.role === "string" ? byUserId.role : null
  );
}

export async function persistAccountRole(
  supabase: Parameters<typeof persistEmployerAccount>[0],
  userId: string,
  role: AccountKind,
  email?: string | null
): Promise<{ error: string | null }> {
  if (role === "employer") {
    await persistEmployerAccount(supabase, userId, email);
    return { error: null };
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      role: "candidate",
      account_type: "candidate",
    },
  });

  if (metadataError) {
    console.warn("Candidate metadata update failed:", metadataError.message);
  }

  const workEmail = email?.trim() || null;
  const lookupClient = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        or: (
          filter: string
        ) => {
          limit: (count: number) => {
            maybeSingle: () => PromiseLike<{
              data: { id?: string | null } | null;
            }>;
          };
        };
      };
    };
  };

  const { data: existing } = await lookupClient
    .from("profiles")
    .select("id")
    .or(`id.eq.${userId},user_id.eq.${userId}`)
    .limit(1)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    id: typeof existing?.id === "string" ? existing.id : userId,
    user_id: userId,
    role: "candidate",
    is_visible_in_pool: false,
  };

  if (workEmail) {
    payload.email = workEmail;
    payload.contact_email = workEmail;
  }

  const { error } = await supabase.from("profiles").upsert(payload, {
    onConflict: "id",
  });

  if (error) {
    console.warn("Candidate profile role save failed:", error.message);
    return { error: error.message ?? "Could not save your account type." };
  }

  return { error: null };
}

export async function loadStoredAccountRole(
  supabase: unknown,
  user: User
): Promise<string | null> {
  const client = supabase as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string
        ) => {
          maybeSingle: () => PromiseLike<{
            data: { role?: string | null } | null;
          }>;
        };
      };
    };
  };

  const { data } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return resolveAccountRole(
    typeof data?.role === "string" ? data.role : null,
    user
  );
}
