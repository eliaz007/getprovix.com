import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  exchangeGithubAppOAuthCode,
  findSoloGithubAppInstallationId,
  listGithubAppInstallationsForUserToken,
  resolveGithubAppSlug,
} from "@/lib/github-app-client";
import { persistGithubAppInstallation } from "@/lib/github-app-persist";
import {
  GITHUB_APP_OAUTH_STATE_COOKIE,
  GITHUB_APP_OAUTH_USER_COOKIE,
  githubAppInstallUrlForSlug,
  githubAppOAuthRedirectUri,
  githubAppSlugFromEnv,
  hashGithubAppOAuthState,
  onboardingSetupPath,
  parseGithubOAuthCallback,
  resolveAppOrigin,
} from "@/lib/github-app-install";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clearOauthCookies(response: NextResponse) {
  response.cookies.set(GITHUB_APP_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function GET(request: Request) {
  const origin = resolveAppOrigin(request);
  const url = new URL(request.url);
  const callback = parseGithubOAuthCallback(url.searchParams);
  const failure = new URL("/onboarding", origin);
  failure.searchParams.set("error", "github_oauth_failed");

  if (callback.error || !callback.code || !callback.state) {
    const response = NextResponse.redirect(failure);
    clearOauthCookies(response);
    return response;
  }

  const cookieStore = await cookies();
  const expectedHash = cookieStore.get(GITHUB_APP_OAUTH_STATE_COOKIE)?.value ?? "";
  if (!expectedHash || expectedHash !== hashGithubAppOAuthState(callback.state)) {
    const response = NextResponse.redirect(failure);
    clearOauthCookies(response);
    return response;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const login = new URL("/login", origin);
    login.searchParams.set("next", "/api/github/oauth/start");
    const response = NextResponse.redirect(login);
    clearOauthCookies(response);
    return response;
  }

  // Must match the redirect_uri sent to /login/oauth/authorize.
  const redirectUri = githubAppOAuthRedirectUri(request);
  const token = await exchangeGithubAppOAuthCode({
    code: callback.code,
    redirectUri,
  });
  if (!token) {
    const response = NextResponse.redirect(failure);
    clearOauthCookies(response);
    return response;
  }

  // If the App is already installed, GitHub skips /installations/new and never
  // hits our install callback — sync the existing installation into Provix now.
  const existing = await listGithubAppInstallationsForUserToken(token.accessToken);
  const installationId = existing[0]?.id ?? (await findSoloGithubAppInstallationId());
  if (installationId) {
    const saved = await persistGithubAppInstallation({
      supabase,
      userId: user.id,
      installationId,
      setupAction: "existing",
      accountLoginHint: existing[0]?.accountLogin ?? token.login,
    });
    if (saved.saved) {
      const response = NextResponse.redirect(
        new URL(onboardingSetupPath(saved.repositories[0] ?? null), origin)
      );
      clearOauthCookies(response);
      return response;
    }
    console.error("[github-oauth] persist failed", saved.error);
  }

  // Fresh install path.
  const slug = githubAppSlugFromEnv() ?? (await resolveGithubAppSlug());
  if (!slug) {
    const missingSlug = new URL("/onboarding", origin);
    missingSlug.searchParams.set("error", "github_app_slug_missing");
    const response = NextResponse.redirect(missingSlug);
    clearOauthCookies(response);
    return response;
  }
  const response = NextResponse.redirect(githubAppInstallUrlForSlug(slug, callback.state));
  clearOauthCookies(response);
  if (token.login) {
    response.cookies.set(GITHUB_APP_OAUTH_USER_COOKIE, token.login, {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/",
      maxAge: 900,
    });
  }
  return response;
}
