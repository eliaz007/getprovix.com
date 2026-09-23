import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";

export type GitHubProfileLink = {
  github_username: string | null;
  github_verified: boolean;
};

function firstUsername(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim().replace(/^@/, "");
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

/** GitHub login from a Supabase user (identity first, then user_metadata). */
export function githubUsernameFromUser(
  user: User | null | undefined
): string | null {
  if (!user) {
    return null;
  }

  const identity = user.identities?.find((item) => item.provider === "github");
  const identityData = (identity?.identity_data ?? {}) as Record<string, unknown>;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

  return firstUsername([
    identityData.user_name,
    identityData.preferred_username,
    identityData.login,
    meta.user_name,
    meta.preferred_username,
    meta.login,
    meta.github_username,
    meta.github,
  ]);
}

export function userHasGitHubIdentity(
  user: User | null | undefined
): boolean {
  if (!user) {
    return false;
  }

  if (user.identities?.some((item) => item.provider === "github")) {
    return true;
  }

  const app = (user.app_metadata ?? {}) as Record<string, unknown>;
  if (app.provider === "github") {
    return true;
  }

  return (
    Array.isArray(app.providers) &&
    app.providers.some((provider) => provider === "github")
  );
}

/** Profile GitHub link derived from the current auth user. */
export function githubLinkFromUser(
  user: User | null | undefined
): GitHubProfileLink {
  if (!userHasGitHubIdentity(user)) {
    return { github_username: null, github_verified: false };
  }

  return {
    github_username: githubUsernameFromUser(user),
    github_verified: true,
  };
}

export async function syncGitHubIdentityToProfile(
  supabase: Pick<SupabaseClient, "from">,
  user: User | null | undefined
): Promise<GitHubProfileLink | null> {
  if (!user?.id) {
    return null;
  }

  const link = githubLinkFromUser(user);
  const { error } = await supabase
    .from("profiles")
    .update({
      github_username: link.github_username,
      github_verified: link.github_verified,
    })
    .or(`id.eq.${user.id},user_id.eq.${user.id}`);

  if (error && !isSupabaseSchemaError(error)) {
    console.error("[github-identity] profile sync failed:", error);
  }

  return link;
}
