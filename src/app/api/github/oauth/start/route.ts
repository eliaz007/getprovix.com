import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  GITHUB_APP_OAUTH_STATE_COOKIE,
  createGithubAppOAuthState,
  githubAppClientId,
  githubAppOAuthAuthorizeUrl,
  githubAppOAuthRedirectUri,
  hashGithubAppOAuthState,
  resolveAppOrigin,
} from "@/lib/github-app-install";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = resolveAppOrigin(request);
  const clientId = githubAppClientId();
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/onboarding?error=github_app_not_configured", origin)
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const onboarding = new URL("/onboarding", origin);
    onboarding.searchParams.set("error", "sign_in_required");
    return NextResponse.redirect(onboarding);
  }

  const state = createGithubAppOAuthState();
  const redirectUri = githubAppOAuthRedirectUri(request);
  const authorizeUrl = githubAppOAuthAuthorizeUrl({ clientId, redirectUri, state });
  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(GITHUB_APP_OAUTH_STATE_COOKIE, hashGithubAppOAuthState(state), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 600,
  });
  return response;
}
