import type { User } from "@supabase/supabase-js";

export type AccountKind = "employer" | "candidate";

/** Employer hiring home: vetted talent pipeline, not the candidate profile. */
export const EMPLOYER_DASHBOARD_PATH = "/dashboard?tab=talent";

const EMPLOYER_ONLY_TABS = new Set(["talent", "applicants", "evaluator"]);

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
    pathname === "/dashboard/interview-simulator"
  ) {
    return true;
  }

  return pathname === "/dashboard" && !isEmployerDashboardRequest(pathname, search);
}

export function resolvePostAuthDestination(input: {
  role: string | null | undefined;
  requestedNext?: string | null;
  isAdmin?: boolean;
}): string {
  if (input.isAdmin) {
    return "/admin";
  }

  const requested = sanitizeInternalPath(input.requestedNext);
  const employer = normalizeAccountKind(input.role) === "employer";

  if (employer) {
    if (!requested) {
      return EMPLOYER_DASHBOARD_PATH;
    }

    const url = new URL(requested, "https://getprovix.com");
    if (isCandidateShellPath(url.pathname, url.search)) {
      return EMPLOYER_DASHBOARD_PATH;
    }

    return `${url.pathname}${url.search}`;
  }

  if (!requested) {
    return "/dashboard";
  }

  const url = new URL(requested, "https://getprovix.com");
  if (isEmployerDashboardRequest(url.pathname, url.search)) {
    return "/dashboard";
  }

  return `${url.pathname}${url.search}`;
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
): { role: AccountKind; is_visible_in_pool: boolean } {
  if (normalizeAccountKind(role) === "employer") {
    return { role: "employer", is_visible_in_pool: false };
  }

  return { role: "candidate", is_visible_in_pool: false };
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
