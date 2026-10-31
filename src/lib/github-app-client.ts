import { createSign } from "node:crypto";
import { githubAppClientId, githubAppClientSecret } from "@/lib/github-app-install";

export type GithubInstallationRepo = {
  fullName: string;
  language: string | null;
  private: boolean;
  description: string | null;
  htmlUrl: string;
};

export type GithubInstallationLookup = {
  accountLogin: string | null;
  repositories: string[];
  repositoryDetails: GithubInstallationRepo[];
};

export type GithubAppOAuthToken = {
  accessToken: string;
  tokenType: string;
  scope: string;
  login: string | null;
};

const EMPTY: GithubInstallationLookup = {
  accountLogin: null,
  repositories: [],
  repositoryDetails: [],
};
const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function base64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function appPrivateKey(): string | null {
  let raw = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!raw) return null;
  // Vercel / dotenv pastes often keep the surrounding quotes from .env.local.
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1).trim();
  }
  return raw.replace(/\\n/g, "\n");
}

function githubAppJwt(appId: string, privateKey: string): string | null {
  try {
    const now = Math.floor(Date.now() / 1000);
    const encoded = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
      JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })
    )}`;
    const signer = createSign("RSA-SHA256");
    signer.update(encoded);
    return `${encoded}.${signer.sign(privateKey).toString("base64url")}`;
  } catch (error) {
    console.error("[github-app] could not sign the app token", error instanceof Error ? error.message : error);
    return null;
  }
}

async function githubFetch(path: string, token: string, method = "GET"): Promise<unknown | null> {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "provix-architecture-firewall",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    console.error("[github-app] GitHub returned", response.status, path);
    return null;
  }
  return (await response.json()) as unknown;
}

function repositoryDetailsFromPayload(payload: unknown): GithubInstallationRepo[] {
  if (!payload || typeof payload !== "object" || !("repositories" in payload)) return [];
  const rows = (payload as { repositories?: unknown }).repositories;
  if (!Array.isArray(rows)) return [];
  const details: GithubInstallationRepo[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || !("full_name" in row)) continue;
    const name = (row as { full_name?: unknown }).full_name;
    if (typeof name !== "string" || !REPO_NAME.test(name)) continue;
    const language =
      "language" in row && typeof (row as { language?: unknown }).language === "string"
        ? (row as { language: string }).language
        : null;
    const description =
      "description" in row && typeof (row as { description?: unknown }).description === "string"
        ? (row as { description: string }).description
        : null;
    const htmlUrl =
      "html_url" in row && typeof (row as { html_url?: unknown }).html_url === "string"
        ? (row as { html_url: string }).html_url
        : `https://github.com/${name}`;
    const isPrivate =
      "private" in row && typeof (row as { private?: unknown }).private === "boolean"
        ? (row as { private: boolean }).private
        : false;
    details.push({
      fullName: name,
      language,
      private: isPrivate,
      description,
      htmlUrl,
    });
  }
  return details;
}

function repositoryNames(payload: unknown): string[] {
  return repositoryDetailsFromPayload(payload).map((repo) => repo.fullName);
}

function accountLogin(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("account" in payload)) return null;
  const account = (payload as { account?: unknown }).account;
  if (!account || typeof account !== "object" || !("login" in account)) return null;
  const login = (account as { login?: unknown }).login;
  return typeof login === "string" && /^[A-Za-z0-9_.-]+$/.test(login) ? login : null;
}

/** Exchange a GitHub App user-to-server OAuth code for an access token. */
export async function exchangeGithubAppOAuthCode(input: {
  code: string;
  redirectUri: string;
}): Promise<GithubAppOAuthToken | null> {
  const clientId = githubAppClientId();
  const clientSecret = githubAppClientSecret();
  if (!clientId || !clientSecret) {
    console.error("[github-app] GITHUB_APP_CLIENT_ID or GITHUB_APP_CLIENT_SECRET is not set");
    return null;
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "provix-architecture-firewall",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    }),
  });
  if (!response.ok) {
    console.error("[github-app] OAuth token exchange failed", response.status);
    return null;
  }

  const payload = (await response.json()) as {
    access_token?: unknown;
    token_type?: unknown;
    scope?: unknown;
    error?: unknown;
    error_description?: unknown;
  };
  if (typeof payload.access_token !== "string" || payload.access_token.length === 0) {
    console.error(
      "[github-app] OAuth token missing",
      typeof payload.error_description === "string" ? payload.error_description : payload.error
    );
    return null;
  }

  const user = await githubFetch("/user", payload.access_token);
  const login =
    user && typeof user === "object" && "login" in user && typeof (user as { login?: unknown }).login === "string"
      ? ((user as { login: string }).login.trim() || null)
      : null;

  return {
    accessToken: payload.access_token,
    tokenType: typeof payload.token_type === "string" ? payload.token_type : "bearer",
    scope: typeof payload.scope === "string" ? payload.scope : "",
    login: login && /^[A-Za-z0-9_.-]+$/.test(login) ? login : null,
  };
}

const SLUG_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** Resolve the public App slug from env or `GET /app` (needs App ID + private key). */
export async function resolveGithubAppSlug(): Promise<string | null> {
  const configured = process.env.GITHUB_APP_SLUG?.trim();
  if (configured && SLUG_RE.test(configured)) return configured;

  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = appPrivateKey();
  if (!appId || !privateKey) return null;
  const jwt = githubAppJwt(appId, privateKey);
  if (!jwt) return null;

  const app = await githubFetch("/app", jwt);
  if (!app || typeof app !== "object" || !("slug" in app)) return null;
  const slug = (app as { slug?: unknown }).slug;
  return typeof slug === "string" && SLUG_RE.test(slug) ? slug : null;
}

export type GithubAppInstallationRef = {
  id: number;
  accountLogin: string | null;
};

function parseInstallationRefs(payload: unknown): GithubAppInstallationRef[] {
  const rows =
    payload && typeof payload === "object" && "installations" in payload
      ? (payload as { installations?: unknown }).installations
      : Array.isArray(payload)
        ? payload
        : null;
  if (!Array.isArray(rows)) return [];
  const out: GithubAppInstallationRef[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || !("id" in row)) continue;
    const id = (row as { id?: unknown }).id;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) continue;
    const account =
      "account" in row && row.account && typeof row.account === "object" && "login" in row.account
        ? (row.account as { login?: unknown }).login
        : null;
    out.push({
      id,
      accountLogin: typeof account === "string" && /^[A-Za-z0-9_.-]+$/.test(account) ? account : null,
    });
  }
  return out;
}

async function listGithubAppInstallationsViaJwt(): Promise<GithubAppInstallationRef[]> {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = appPrivateKey();
  if (!appId || !privateKey) return [];
  const jwt = githubAppJwt(appId, privateKey);
  if (!jwt) return [];
  const out: GithubAppInstallationRef[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const payload = await githubFetch(`/app/installations?per_page=100&page=${page}`, jwt);
    const rows = parseInstallationRefs(payload);
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

/**
 * Find this App's installation id for a GitHub account login (App JWT).
 * Used when GitHub skips /installations/new because the App is already installed.
 */
export async function findGithubAppInstallationIdForAccount(
  accountLogin: string
): Promise<number | null> {
  const login = accountLogin.trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(login)) return null;
  const rows = await listGithubAppInstallationsViaJwt();
  const match = rows.find(
    (row) => row.accountLogin && row.accountLogin.toLowerCase() === login.toLowerCase()
  );
  return match?.id ?? null;
}

/**
 * When the App has exactly one installation (solo/dev), return it.
 * Avoids matching failures when the Provix session is Google-only.
 */
export async function findSoloGithubAppInstallationId(): Promise<number | null> {
  const rows = await listGithubAppInstallationsViaJwt();
  return rows.length === 1 ? rows[0].id : null;
}

/** List App installations visible to a user-to-server OAuth token. */
export async function listGithubAppInstallationsForUserToken(
  accessToken: string
): Promise<GithubAppInstallationRef[]> {
  const appIdRaw = process.env.GITHUB_APP_ID?.trim();
  const appId = appIdRaw && /^\d+$/.test(appIdRaw) ? Number(appIdRaw) : null;
  const out: GithubAppInstallationRef[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const payload = await githubFetch(`/user/installations?per_page=100&page=${page}`, accessToken);
    const rows =
      payload && typeof payload === "object" && "installations" in payload
        ? (payload as { installations?: unknown }).installations
        : null;
    if (!Array.isArray(rows)) break;
    for (const row of rows) {
      if (!row || typeof row !== "object" || !("id" in row)) continue;
      const id = (row as { id?: unknown }).id;
      if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) continue;
      if (appId != null) {
        const rowAppId =
          "app_id" in row && typeof (row as { app_id?: unknown }).app_id === "number"
            ? (row as { app_id: number }).app_id
            : null;
        if (rowAppId != null && rowAppId !== appId) continue;
      }
      const account =
        "account" in row && row.account && typeof row.account === "object" && "login" in row.account
          ? (row.account as { login?: unknown }).login
          : null;
      out.push({
        id,
        accountLogin: typeof account === "string" && /^[A-Za-z0-9_.-]+$/.test(account) ? account : null,
      });
    }
    if (rows.length < 100) break;
  }
  return out;
}

/** Mint an installation access token for a specific repository (App JWT + private key). */
export async function resolveGithubInstallationTokenForRepo(
  owner: string,
  repo: string
): Promise<string | null> {
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = appPrivateKey();
  if (!appId || !privateKey) return null;
  const jwt = githubAppJwt(appId, privateKey);
  if (!jwt) return null;

  const installation = await githubFetch(`/repos/${owner}/${repo}/installation`, jwt);
  const installationId =
    installation && typeof installation === "object" && "id" in installation
      ? (installation as { id?: unknown }).id
      : null;
  if (typeof installationId !== "number" || !Number.isFinite(installationId) || installationId <= 0) {
    return null;
  }

  const tokenPayload = await githubFetch(`/app/installations/${installationId}/access_tokens`, jwt, "POST");
  const token =
    tokenPayload && typeof tokenPayload === "object" && "token" in tokenPayload
      ? (tokenPayload as { token?: unknown }).token
      : null;
  return typeof token === "string" && token.length > 0 ? token : null;
}

/** List repositories for an installation when the GitHub App key is configured. */
export async function lookupGithubInstallation(installationId: number): Promise<GithubInstallationLookup> {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = appPrivateKey();
  if (!appId || !privateKey) return EMPTY;

  const jwt = githubAppJwt(appId, privateKey);
  if (!jwt) return EMPTY;

  const tokenPayload = await githubFetch(`/app/installations/${installationId}/access_tokens`, jwt, "POST");
  const token =
    tokenPayload && typeof tokenPayload === "object" && "token" in tokenPayload
      ? (tokenPayload as { token?: unknown }).token
      : null;
  if (typeof token !== "string" || token.length === 0) return EMPTY;

  const [installation, repositories] = await Promise.all([
    githubFetch(`/app/installations/${installationId}`, jwt),
    githubFetch("/installation/repositories?per_page=100", token),
  ]);

  const repositoryDetails = repositoryDetailsFromPayload(repositories);
  return {
    accountLogin: accountLogin(installation),
    repositories: repositoryDetails.map((repo) => repo.fullName),
    repositoryDetails,
  };
}
