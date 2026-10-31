import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  findGithubAppInstallationIdForAccount,
  lookupGithubInstallation,
  type GithubInstallationRepo,
} from "@/lib/github-app-client";
import { persistGithubAppInstallation } from "@/lib/github-app-persist";
import { githubUsernameFromUser } from "@/lib/github-identity";
import {
  rankOnboardingRepos,
  type OnboardingRepositoriesResponse,
} from "@/lib/onboarding-repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function json(body: OnboardingRepositoriesResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function empty(partial?: Partial<OnboardingRepositoriesResponse>): OnboardingRepositoriesResponse {
  return {
    authenticated: false,
    installed: false,
    repositories: [],
    preferred: [],
    primaryRepo: null,
    ...partial,
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return json(empty());
  }

  let installationsQuery = await supabase
    .from("github_app_installations")
    .select("installation_id, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  let installationIds = (installationsQuery.data ?? []).flatMap((row) => {
    const id = typeof row.installation_id === "number" ? row.installation_id : Number(row.installation_id);
    return Number.isSafeInteger(id) && id > 0 ? [id] : [];
  });

  // Already installed on GitHub but never stored (common when GitHub redirects to
  // /settings/installations/:id instead of the setup callback).
  let syncError: string | null = null;
  if (installationIds.length === 0) {
    const login = githubUsernameFromUser(user);
    try {
      // Match by GitHub login only — never adopt a random solo App installation.
      const installationId = login ? await findGithubAppInstallationIdForAccount(login) : null;
      if (installationId) {
        const saved = await persistGithubAppInstallation({
          supabase,
          userId: user.id,
          installationId,
          setupAction: "synced",
          accountLoginHint: login,
        });
        if (!saved.saved) {
          syncError =
            saved.error ??
            "Could not save the GitHub App installation. Apply the github_app_installations migration.";
        }
        installationsQuery = await supabase
          .from("github_app_installations")
          .select("installation_id, updated_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false });
        installationIds = (installationsQuery.data ?? []).flatMap((row) => {
          const id =
            typeof row.installation_id === "number"
              ? row.installation_id
              : Number(row.installation_id);
          return Number.isSafeInteger(id) && id > 0 ? [id] : [];
        });
      } else if (!login) {
        syncError =
          "Sign in with GitHub (or link a GitHub identity) so Provix can match your App install.";
      }
    } catch (error) {
      syncError = error instanceof Error ? error.message : "Could not sync GitHub App installation.";
      console.error("[github-repos] could not sync existing installation", syncError);
    }
  }

  let details: GithubInstallationRepo[] = [];
  const newest = installationIds[0];
  if (newest) {
    try {
      const live = await lookupGithubInstallation(newest);
      details = live.repositoryDetails;
      if (details.length > 0) {
        const savedAt = new Date().toISOString();
        await supabase.from("github_app_repositories").upsert(
          details.map((repo) => ({
            user_id: user.id,
            installation_id: newest,
            full_name: repo.fullName,
            updated_at: savedAt,
          })),
          { onConflict: "user_id,full_name" }
        );
      }
    } catch (error) {
      console.error(
        "[github-repos] installation lookup failed",
        error instanceof Error ? error.message : error
      );
    }
  }

  if (details.length === 0) {
    const repositoriesQuery = await supabase
      .from("github_app_repositories")
      .select("full_name")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    details = (repositoriesQuery.data ?? []).flatMap((row) => {
      if (typeof row.full_name !== "string" || !REPO_NAME.test(row.full_name)) return [];
      return [
        {
          fullName: row.full_name,
          language: null,
          private: false,
          description: null,
          htmlUrl: `https://github.com/${row.full_name}`,
        },
      ];
    });
  }

  const ranked = rankOnboardingRepos(details);
  const preferred = ranked.filter(
    (repo) =>
      (repo.language && /^(typescript|javascript)$/i.test(repo.language)) ||
      /\bnext/i.test(`${repo.fullName} ${repo.description ?? ""}`)
  );

  const installed = installationIds.length > 0 || ranked.length > 0;
  return json({
    authenticated: true,
    installed,
    repositories: ranked,
    preferred: preferred.length > 0 ? preferred : ranked.slice(0, 8),
    primaryRepo: ranked[0]?.fullName ?? null,
    ...(installed || !syncError ? {} : { message: syncError }),
  });
}
