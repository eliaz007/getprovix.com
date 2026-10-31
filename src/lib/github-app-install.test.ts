import { afterEach, describe, expect, it } from "vitest";
import {
  createGithubAppOAuthState,
  githubAppInstallUrlForSlug,
  githubAppOAuthAuthorizeUrl,
  githubAppOAuthRedirectUri,
  hashGithubAppOAuthState,
  integrityDashboardPath,
  onboardingSetupPath,
  parseGithubInstallCallback,
  parseGithubOAuthCallback,
  resolveAppOrigin,
} from "@/lib/github-app-install";

describe("parseGithubInstallCallback", () => {
  it("reads the installation id, setup action, and optional OAuth code", () => {
    const params = new URLSearchParams(
      "installation_id=12345&setup_action=install&state=abc&code=oauth_code_99"
    );
    expect(parseGithubInstallCallback(params)).toEqual({
      installationId: 12345,
      setupAction: "install",
      state: "abc",
      code: "oauth_code_99",
    });
  });

  it("drops a missing or non-numeric installation id", () => {
    expect(parseGithubInstallCallback(new URLSearchParams("setup_action=install")).installationId).toBeNull();
    expect(parseGithubInstallCallback(new URLSearchParams("installation_id=0")).installationId).toBeNull();
    expect(parseGithubInstallCallback(new URLSearchParams("installation_id=12abc")).installationId).toBeNull();
  });
});

describe("parseGithubOAuthCallback", () => {
  it("reads the authorization code and state", () => {
    expect(parseGithubOAuthCallback(new URLSearchParams("code=abc12345&state=csrf"))).toEqual({
      code: "abc12345",
      state: "csrf",
      error: null,
    });
  });

  it("captures provider errors", () => {
    expect(parseGithubOAuthCallback(new URLSearchParams("error=access_denied")).error).toBe("access_denied");
  });
});

describe("oauth helpers", () => {
  it("builds the authorize and install URLs", () => {
    expect(
      githubAppOAuthAuthorizeUrl({
        clientId: "Iv1.abc",
        redirectUri: "http://localhost:3000/api/github/oauth/callback",
        state: "csrf",
      })
    ).toContain("https://github.com/login/oauth/authorize?");
    expect(githubAppInstallUrlForSlug("my-app", "csrf")).toBe(
      "https://github.com/apps/my-app/installations/new?state=csrf"
    );
  });

  it("hashes oauth state deterministically", () => {
    const state = createGithubAppOAuthState();
    expect(hashGithubAppOAuthState(state)).toBe(hashGithubAppOAuthState(state));
    expect(hashGithubAppOAuthState(state)).not.toBe(state);
  });
});

describe("resolveAppOrigin / githubAppOAuthRedirectUri", () => {
  const original = {
    redirect: process.env.GITHUB_APP_REDIRECT_ORIGIN,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    vercel: process.env.VERCEL_URL,
  };

  afterEach(() => {
    if (original.redirect === undefined) delete process.env.GITHUB_APP_REDIRECT_ORIGIN;
    else process.env.GITHUB_APP_REDIRECT_ORIGIN = original.redirect;
    if (original.appUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original.appUrl;
    if (original.vercel === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = original.vercel;
  });

  it("uses NEXT_PUBLIC_APP_URL for local development", () => {
    delete process.env.GITHUB_APP_REDIRECT_ORIGIN;
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    delete process.env.VERCEL_URL;
    expect(resolveAppOrigin()).toBe("http://localhost:3000");
    expect(githubAppOAuthRedirectUri()).toBe("http://localhost:3000/api/github/oauth/callback");
  });

  it("uses production NEXT_PUBLIC_APP_URL on getprovix.com", () => {
    delete process.env.GITHUB_APP_REDIRECT_ORIGIN;
    process.env.NEXT_PUBLIC_APP_URL = "https://getprovix.com";
    delete process.env.VERCEL_URL;
    expect(githubAppOAuthRedirectUri()).toBe("https://getprovix.com/api/github/oauth/callback");
  });

  it("lets GITHUB_APP_REDIRECT_ORIGIN override the public app URL", () => {
    process.env.GITHUB_APP_REDIRECT_ORIGIN = "https://getprovix.com/";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    expect(resolveAppOrigin()).toBe("https://getprovix.com");
  });
});

describe("integrityDashboardPath", () => {
  it("opens repository integrity with the connected repo", () => {
    expect(integrityDashboardPath("eliaz007/getprovix.com")).toBe(
      "/firewall?view=health&pane=integrity&repo=eliaz007%2Fgetprovix.com"
    );
  });

  it("omits a repo that is not owner/name", () => {
    expect(integrityDashboardPath(null)).toBe("/firewall?view=health&pane=integrity");
    expect(integrityDashboardPath("not a repo")).toBe("/firewall?view=health&pane=integrity");
  });
});

describe("onboardingSetupPath", () => {
  it("returns to onboarding after GitHub App install", () => {
    expect(onboardingSetupPath("acme/next-app")).toBe(
      "/onboarding?connected=1&repo=acme%2Fnext-app"
    );
    expect(onboardingSetupPath(null)).toBe("/onboarding?connected=1");
  });
});
