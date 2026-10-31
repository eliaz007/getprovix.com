import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { exchangeGithubAppOAuthCode } from "@/lib/github-app-client";
import { persistGithubAppInstallation } from "@/lib/github-app-persist";
import {
  GITHUB_APP_INSTALL_CALLBACK_PATH,
  GITHUB_APP_OAUTH_USER_COOKIE,
  onboardingSetupPath,
  parseGithubInstallCallback,
  resolveAppOrigin,
} from "@/lib/github-app-install";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = resolveAppOrigin(request);
  const callback = parseGithubInstallCallback(url.searchParams);
  const returnPath = `${url.pathname}${url.search}`;

  if (callback.installationId === null) {
    return NextResponse.redirect(new URL(onboardingSetupPath(null), origin));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL("/login", origin);
    login.searchParams.set("next", returnPath);
    return NextResponse.redirect(login);
  }

  const cookieStore = await cookies();
  let accountLoginHint = cookieStore.get(GITHUB_APP_OAUTH_USER_COOKIE)?.value ?? null;

  // GitHub can also send a user OAuth `code` when "Request user authorization during installation" is enabled.
  if (callback.code) {
    const token = await exchangeGithubAppOAuthCode({
      code: callback.code,
      redirectUri: `${origin}${GITHUB_APP_INSTALL_CALLBACK_PATH}`,
    });
    if (token?.login) accountLoginHint = token.login;
  }

  const saved = await persistGithubAppInstallation({
    supabase,
    userId: user.id,
    installationId: callback.installationId,
    setupAction: callback.setupAction,
    accountLoginHint,
  });

  const response = NextResponse.redirect(
    new URL(onboardingSetupPath(saved.repositories[0] ?? null), origin)
  );
  response.cookies.set(GITHUB_APP_OAUTH_USER_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
