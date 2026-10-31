import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/admin-access";
import { lookupGithubInstallation } from "@/lib/github-app-client";

export async function persistGithubAppInstallation(input: {
  supabase: SupabaseClient;
  userId: string;
  installationId: number;
  setupAction: string | null;
  accountLoginHint?: string | null;
}): Promise<{ accountLogin: string | null; repositories: string[]; saved: boolean; error: string | null }> {
  const lookup = await lookupGithubInstallation(input.installationId);
  const accountLogin = lookup.accountLogin ?? input.accountLoginHint ?? null;
  const savedAt = new Date().toISOString();
  // Prefer service role so RLS / missing user policies cannot block the install handshake.
  const writer = createServiceRoleClient() ?? input.supabase;

  const installation = await writer.from("github_app_installations").upsert(
    {
      user_id: input.userId,
      installation_id: input.installationId,
      setup_action: input.setupAction,
      account_login: accountLogin,
      updated_at: savedAt,
    },
    { onConflict: "user_id,installation_id" }
  );

  if (installation.error) {
    console.error("[github-install] could not store the installation", installation.error.message);
    return {
      accountLogin,
      repositories: lookup.repositories,
      saved: false,
      error: installation.error.message,
    };
  }

  if (lookup.repositories.length > 0) {
    const repositories = await writer.from("github_app_repositories").upsert(
      lookup.repositories.map((fullName) => ({
        user_id: input.userId,
        installation_id: input.installationId,
        full_name: fullName,
        updated_at: savedAt,
      })),
      { onConflict: "user_id,full_name" }
    );
    if (repositories.error) {
      console.error("[github-install] could not store repositories", repositories.error.message);
      return {
        accountLogin,
        repositories: lookup.repositories,
        saved: false,
        error: repositories.error.message,
      };
    }
  }

  return { accountLogin, repositories: lookup.repositories, saved: true, error: null };
}
