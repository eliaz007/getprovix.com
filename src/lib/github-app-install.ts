import { createHash, randomBytes } from "node:crypto";

/** Client-safe path: server resolves the real `https://github.com/apps/{slug}/installations/new`. */
export const GITHUB_APP_CONNECT_PATH = "/api/github/install/start";
export const GITHUB_APP_OAUTH_START_PATH = "/api/github/oauth/start";
export const GITHUB_APP_OAUTH_CALLBACK_PATH = "/api/github/oauth/callback";
export const GITHUB_APP_INSTALL_CALLBACK_PATH = "/api/github/install";

const SLUG_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export function githubAppSlugFromEnv(): string | null {
  const configured = process.env.GITHUB_APP_SLUG?.trim();
  return configured && SLUG_RE.test(configured) ? configured : null;
}

/** Build the public GitHub App install URL for a known slug. */
export function githubAppInstallUrlForSlug(slug: string, state?: string | null): string {
  const base = `https://github.com/apps/${slug}/installations/new`;
  if (!state) return base;
  const params = new URLSearchParams({ state });
  return `${base}?${params.toString()}`;
}

/** @deprecated Prefer githubAppInstallUrlForSlug after resolveGithubAppSlug(). */
export function githubAppInstallUrl(state?: string | null): string {
  const slug = githubAppSlugFromEnv() ?? "provix";
  return githubAppInstallUrlForSlug(slug, state);
}

export const GITHUB_APP_OAUTH_STATE_COOKIE = "provix_github_app_oauth_state";
export const GITHUB_APP_OAUTH_USER_COOKIE = "provix_github_app_login";

export type GithubInstallCallback = {
  installationId: number | null;
  setupAction: string | null;
  state: string | null;
  code: string | null;
};

const SETUP_ACTION = /^[a-z_]{1,32}$/;
const OAUTH_CODE = /^[A-Za-z0-9._-]{8,200}$/;

export function parseGithubInstallCallback(params: URLSearchParams): GithubInstallCallback {
  const rawId = params.get("installation_id")?.trim() ?? "";
  const installationId = /^[1-9]\d{0,18}$/.test(rawId) ? Number(rawId) : null;
  const action = params.get("setup_action")?.trim().toLowerCase() ?? "";
  const state = params.get("state")?.trim() ?? "";
  const code = params.get("code")?.trim() ?? "";
  return {
    installationId: installationId !== null && Number.isSafeInteger(installationId) ? installationId : null,
    setupAction: SETUP_ACTION.test(action) ? action : null,
    state: state.length > 0 && state.length <= 200 ? state : null,
    code: OAUTH_CODE.test(code) ? code : null,
  };
}

export function parseGithubOAuthCallback(params: URLSearchParams): {
  code: string | null;
  state: string | null;
  error: string | null;
} {
  const code = params.get("code")?.trim() ?? "";
  const state = params.get("state")?.trim() ?? "";
  const error = params.get("error")?.trim() ?? "";
  return {
    code: OAUTH_CODE.test(code) ? code : null,
    state: state.length > 0 && state.length <= 200 ? state : null,
    error: error.length > 0 && error.length <= 64 ? error : null,
  };
}

/** Integrity dashboard with the repository health tab selected. */
export function integrityDashboardPath(repo: string | null): string {
  const params = new URLSearchParams();
  params.set("view", "health");
  params.set("pane", "integrity");
  if (repo && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) params.set("repo", repo);
  return `/firewall?${params.toString()}`;
}

/** Post–GitHub App install: workspace + first AST audit. */
export function onboardingSetupPath(repo: string | null = null): string {
  const params = new URLSearchParams();
  params.set("connected", "1");
  if (repo && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) params.set("repo", repo);
  return `/onboarding?${params.toString()}`;
}

export function createGithubAppOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

export function hashGithubAppOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("base64url");
}

export function githubAppOAuthAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    allow_signup: "true",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export function githubAppClientId(): string | null {
  const value = process.env.GITHUB_APP_CLIENT_ID?.trim();
  return value ? value : null;
}

export function githubAppClientSecret(): string | null {
  const value = process.env.GITHUB_APP_CLIENT_SECRET?.trim();
  return value ? value : null;
}

const LOCAL_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);

function normalizeOrigin(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim().replace(/\/$/, "") ?? "";
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Prefer the configured public app URL so OAuth redirect_uri matches the
 * Callback URL registered on the GitHub App (local and production).
 */
export function resolveAppOrigin(request?: Request): string {
  const configured =
    normalizeOrigin(process.env.GITHUB_APP_REDIRECT_ORIGIN) ||
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeOrigin(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (configured) return configured;

  if (request) {
    const url = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (forwardedHost) {
      const proto =
        forwardedProto === "http" || forwardedProto === "https"
          ? forwardedProto
          : process.env.NODE_ENV === "development"
            ? "http"
            : "https";
      const fromForwarded = normalizeOrigin(`${proto}://${forwardedHost}`);
      if (fromForwarded) return fromForwarded;
    }
    return url.origin;
  }

  return process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://getprovix.com";
}

export function requestOrigin(request: Request): string {
  return resolveAppOrigin(request);
}

/** Exact redirect_uri for authorize + token exchange. Must be allow-listed on the GitHub App. */
export function githubAppOAuthRedirectUri(request?: Request): string {
  return `${resolveAppOrigin(request)}${GITHUB_APP_OAUTH_CALLBACK_PATH}`;
}

export function isLocalAppOrigin(origin: string): boolean {
  return LOCAL_ORIGINS.has(normalizeOrigin(origin) ?? "");
}
