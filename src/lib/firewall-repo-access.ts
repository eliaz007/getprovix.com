import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveGithubFallbackReadToken,
  resolveGithubInstallationTokenForRepo,
} from "@/lib/github-app-client";

export type FirewallRepoAccess =
  | { ok: true; token: string; source: "github_app" | "github_token" }
  | { ok: false; status: number; message: string };

const GITHUB_TOKEN_PATTERN = /^(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{16,240}$/;

/** A caller-supplied GitHub PAT. Anything else is ignored so a bad field cannot block the server token. */
export function readProvidedGithubToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  return GITHUB_TOKEN_PATTERN.test(token) ? token : null;
}

export function partialScanLine(coverage: {
  scanned: number;
  total: number;
  treeTruncated?: boolean;
} | null | undefined): string | null {
  if (!coverage) return null;
  if (coverage.scanned >= coverage.total && !coverage.treeTruncated) return null;
  return `Scanned ${coverage.scanned} of ${coverage.total} source files (largest first).`;
}

async function userOwnsRepo(
  supabase: SupabaseClient,
  userId: string,
  fullName: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("github_app_repositories")
    .select("full_name")
    .eq("user_id", userId)
    .eq("full_name", fullName)
    .maybeSingle();
  if (error) return false;
  return typeof data?.full_name === "string" && data.full_name === fullName;
}

async function tokenCanReadRepo(token: string, owner: string, repo: string): Promise<boolean> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "provix-architecture-firewall",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  return response.ok;
}

function appConfigured(): boolean {
  return Boolean(process.env.GITHUB_APP_ID?.trim() && process.env.GITHUB_APP_PRIVATE_KEY?.trim());
}

/**
 * Signed-in repo access for scan and fix routes.
 * Allows the user's GitHub App repo row, a PAT that can read the repo, or the
 * server token where that fallback is already the product path (scans always;
 * pull requests only when the App is not configured).
 */
export async function authorizeFirewallRepoAccess(input: {
  supabase: SupabaseClient;
  userId: string;
  owner: string;
  repo: string;
  githubToken?: string | null;
  purpose: "scan" | "write";
  canReadRepo?: (token: string, owner: string, repo: string) => Promise<boolean>;
  appTokenForRepo?: (owner: string, repo: string) => Promise<string | null>;
}): Promise<FirewallRepoAccess> {
  const owner = input.owner.trim();
  const repo = input.repo.trim();
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    return { ok: false, status: 400, message: "repoUrl must be a public GitHub URL or owner/repo." };
  }

  const canRead = input.canReadRepo ?? tokenCanReadRepo;
  const appTokenForRepo = input.appTokenForRepo ?? resolveGithubInstallationTokenForRepo;
  const fullName = `${owner}/${repo}`;

  if (await userOwnsRepo(input.supabase, input.userId, fullName)) {
    const appToken = await appTokenForRepo(owner, repo);
    if (appToken) return { ok: true, token: appToken, source: "github_app" };
  }

  const provided = input.githubToken?.trim() || null;
  if (provided) {
    if (await canRead(provided, owner, repo)) {
      return { ok: true, token: provided, source: "github_token" };
    }
    return {
      ok: false,
      status: 403,
      message: `That GitHub token cannot read ${fullName}. Check the token's repository access, or install the Provix App on this repo.`,
    };
  }

  const serverToken = resolveGithubFallbackReadToken();
  const serverFallbackAllowed = input.purpose === "scan" || !appConfigured();
  if (serverToken && serverFallbackAllowed && (input.purpose === "write" || (await canRead(serverToken, owner, repo)))) {
    return { ok: true, token: serverToken, source: "github_token" };
  }

  return {
    ok: false,
    status: 403,
    message: `Connect the Provix GitHub App for ${fullName}, or scan with a GitHub token that can read this repository.`,
  };
}
