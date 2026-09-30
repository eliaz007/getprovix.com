import type { SupabaseClient, User } from "@supabase/supabase-js";
import { userHasGitHubIdentity } from "@/lib/github-identity";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";

export const PROVIX_FILENAME = "provix.txt";
export const PROVIX_FILENAMES = ["provix.txt", "PROVIX.TXT"] as const;
export const PROVIX_TOKEN_PREFIX = "provix-verify-";
export const PROVIX_BRANCHES = ["main", "master"] as const;

export function buildProvixVerificationToken(userId: string): string {
  const compact = userId.replace(/-/g, "").toLowerCase();
  const shortId = compact.slice(0, 8) || "user";
  return `${PROVIX_TOKEN_PREFIX}${shortId}`;
}

export function canBypassProvixTokenChallenge(
  user: User | null | undefined,
  profileGithubVerified?: boolean | null
): boolean {
  return userHasGitHubIdentity(user) || profileGithubVerified === true;
}

export function normalizeProofToken(value: string): string {
  return value.replace(/^\uFEFF/, "").trim();
}

export function canonicalGitHubRepoUrl(owner: string, repo: string): string {
  return `https://github.com/${owner.trim().toLowerCase()}/${repo.trim().toLowerCase()}`;
}

export async function hasPersistedProvixTokenVerification(
  supabase: Pick<SupabaseClient, "from">,
  userId: string,
  repoUrl: string
): Promise<boolean> {
  const normalized = repoUrl.trim().toLowerCase();
  const { data, error } = await supabase
    .from("repo_verifications")
    .select("is_verified, repo_url")
    .eq("user_id", userId)
    .eq("is_verified", true);

  if (error) {
    if (!isSupabaseSchemaError(error)) {
      console.error("[provix-token] existing verification lookup failed:", error.message);
    }
    return false;
  }

  return (data ?? []).some(
    (row) =>
      typeof row.repo_url === "string" &&
      row.repo_url.trim().toLowerCase() === normalized
  );
}
