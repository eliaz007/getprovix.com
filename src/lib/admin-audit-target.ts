import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminAuditTargetProfile = {
  id: string;
  profileSlug: string | null;
  githubUsername: string | null;
  fullName: string | null;
};

function normalizeHandle(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^@/, "").toLowerCase();
}

/**
 * Resolve which candidate profile an admin unlimited audit should update.
 * Prefers explicit handle/slug, then GitHub owner username match.
 */
export async function resolveAdminAuditTargetProfile(
  supabase: SupabaseClient,
  input: {
    candidateHandle?: string | null;
    githubOwner?: string | null;
  }
): Promise<AdminAuditTargetProfile | null> {
  const handle = normalizeHandle(input.candidateHandle);
  const owner = normalizeHandle(input.githubOwner);

  if (handle) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, profile_slug, github_username, full_name")
      .ilike("profile_slug", handle)
      .limit(1)
      .maybeSingle();

    if (!error && data && typeof data.id === "string") {
      return {
        id: data.id,
        profileSlug:
          typeof data.profile_slug === "string"
            ? data.profile_slug.trim() || null
            : null,
        githubUsername:
          typeof data.github_username === "string"
            ? data.github_username.trim() || null
            : null,
        fullName:
          typeof data.full_name === "string"
            ? data.full_name.trim() || null
            : null,
      };
    }
  }

  if (owner) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, profile_slug, github_username, full_name")
      .ilike("github_username", owner)
      .limit(1)
      .maybeSingle();

    if (!error && data && typeof data.id === "string") {
      return {
        id: data.id,
        profileSlug:
          typeof data.profile_slug === "string"
            ? data.profile_slug.trim() || null
            : null,
        githubUsername:
          typeof data.github_username === "string"
            ? data.github_username.trim() || null
            : null,
        fullName:
          typeof data.full_name === "string"
            ? data.full_name.trim() || null
            : null,
      };
    }
  }

  return null;
}

export async function applyAdminAuditCandidateLabel(
  supabase: SupabaseClient,
  profileId: string,
  candidateName: string | null | undefined
): Promise<void> {
  const name = candidateName?.trim();
  if (!name) {
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: name })
    .eq("id", profileId);

  if (error) {
    console.error("[admin-audit] could not update candidate name:", error);
  }
}
