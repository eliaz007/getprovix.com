import type { User } from "@supabase/supabase-js";

export type AccountKind = "employer" | "candidate";

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
