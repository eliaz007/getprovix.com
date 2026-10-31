import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  findGithubAppInstallationIdForAccount,
  findSoloGithubAppInstallationId,
  resolveGithubAppSlug,
} from "@/lib/github-app-client";
import { persistGithubAppInstallation } from "@/lib/github-app-persist";
import { githubUsernameFromUser } from "@/lib/github-identity";
import {
  githubAppInstallUrlForSlug,
  githubAppSlugFromEnv,
  onboardingSetupPath,
  resolveAppOrigin,
} from "@/lib/github-app-install";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Connect Repository entrypoint.
 * If the App is already installed for this GitHub user, sync it into Provix and
 * skip GitHub's settings page. Otherwise open /installations/new.
 */
export async function GET(request: Request) {
  const origin = resolveAppOrigin(request);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const login = githubUsernameFromUser(user);
  if (user) {
    try {
      const installationId =
        (login ? await findGithubAppInstallationIdForAccount(login) : null) ??
        (await findSoloGithubAppInstallationId());
      if (installationId) {
        const saved = await persistGithubAppInstallation({
          supabase,
          userId: user.id,
          installationId,
          setupAction: "existing",
          accountLoginHint: login,
        });
        if (saved.saved) {
          return NextResponse.redirect(
            new URL(onboardingSetupPath(saved.repositories[0] ?? null), origin)
          );
        }
        console.error("[github-install/start] persist failed", saved.error);
      }
    } catch (error) {
      console.error(
        "[github-install/start] could not sync existing installation",
        error instanceof Error ? error.message : error
      );
    }
  }

  const slug = githubAppSlugFromEnv() ?? (await resolveGithubAppSlug());
  if (!slug) {
    return NextResponse.redirect(
      new URL("/onboarding?error=github_app_slug_missing", origin)
    );
  }
  return NextResponse.redirect(githubAppInstallUrlForSlug(slug));
}
