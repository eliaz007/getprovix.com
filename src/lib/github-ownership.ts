import { githubUsernameFromUser } from "@/lib/github-identity";
import {
  parseGitHubRepoPath,
  parseGitHubUrl,
  repoNamespaceMatchesGitHubUsername,
} from "@/lib/validate-github-url";
import { readJsonResponse } from "@/lib/read-json-response";
import type { User } from "@supabase/supabase-js";

export const REPO_OWNERSHIP_ERROR =
  "Unable to verify repository ownership. You can only claim dossiers for codebases you've authored or contributed to.";

export const REPO_NOT_FOUND_OR_PRIVATE = "REPO_NOT_FOUND_OR_PRIVATE";
export const UNVERIFIED_OWNERSHIP = "UNVERIFIED_OWNERSHIP";

export const REPO_NOT_FOUND_OR_PRIVATE_MESSAGE =
  "This repository is private or does not exist.";
export const UNVERIFIED_OWNERSHIP_MESSAGE =
  "Repository is not owned by your connected GitHub account.";
export const UNVERIFIED_OWNERSHIP_BANNER_TITLE =
  "Repository not linked to your account";
export const UNVERIFIED_OWNERSHIP_BANNER_BODY =
  "We found this repository, but your authenticated GitHub profile does not have authored commits here. You can only audit projects you created or contributed to.";

export const LOW_CONTRIBUTION_WARNING =
  "Linked GitHub account has fewer than 3 commits and under 40% of recent history.";

const MIN_AUTHORED_COMMITS = 3;
const MIN_RECENT_AUTHOR_SHARE = 0.4;

export type GitHubRepoProbe =
  | { status: "not_found"; owner: string; repo: string }
  | {
      status: "found";
      owner: string;
      repo: string;
      isFork: boolean;
      defaultBranch: string | null;
    }
  | { status: "error"; owner: string; repo: string; httpStatus: number };

export async function probeGitHubRepository(
  repoUrl: string
): Promise<GitHubRepoProbe | null> {
  const parsed = parseGitHubUrl(repoUrl);
  const owner = parsed?.owner ?? null;
  const repo = parsed?.repo ?? null;
  if (!owner || !repo) {
    return null;
  }

  try {
    const response = await githubGet(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    );

    if (response.status === 404) {
      return { status: "not_found", owner, repo };
    }

    if (!response.ok) {
      return { status: "error", owner, repo, httpStatus: response.status };
    }

    const payload = (await readJsonResponse(response)) as {
      fork?: boolean;
      default_branch?: string | null;
    };

    return {
      status: "found",
      owner,
      repo,
      isFork: payload.fork === true,
      defaultBranch: payload.default_branch?.trim() || null,
    };
  } catch (error) {
    console.error("[github-ownership] repo probe failed:", error);
    return { status: "error", owner, repo, httpStatus: 0 };
  }
}

const GITHUB_FETCH_TIMEOUT_MS = 12_000;

export type RepoOwnershipVerification = {
  verified: boolean;
  method: "owner" | "contributor" | "fork_author" | null;
  username: string | null;
  owner: string | null;
  repo: string | null;
  isFork: boolean;
  lowContributionWarning: boolean;
};

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Provix-RepoOwnership/1.0",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function githubGet(url: string): Promise<Response> {
  return fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: githubHeaders(),
    signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
  });
}

export function unverifiedOwnership(
  overrides?: Partial<RepoOwnershipVerification>
): RepoOwnershipVerification {
  return {
    verified: false,
    method: null,
    username: null,
    owner: null,
    repo: null,
    isFork: false,
    lowContributionWarning: false,
    ...overrides,
  };
}

function emailMatchesGitHubAccount(email: string, username: string): boolean {
  const normalized = email.trim().toLowerCase();
  const login = username.trim().toLowerCase();
  if (!normalized || !login) {
    return false;
  }
  return (
    normalized === `${login}@users.noreply.github.com` ||
    normalized.endsWith(`+${login}@users.noreply.github.com`)
  );
}

export function githubCommitMatchesLinkedUsername(
  commit: unknown,
  username: string
): boolean {
  if (!commit || typeof commit !== "object") {
    return false;
  }

  const login = username.trim().toLowerCase();
  if (!login) {
    return false;
  }

  const record = commit as {
    author?: { login?: string | null } | null;
    commit?: { author?: { email?: string | null } | null } | null;
  };
  const authorLogin = record.author?.login;
  if (typeof authorLogin === "string" && authorLogin.trim()) {
    return authorLogin.trim().toLowerCase() === login;
  }

  return emailMatchesGitHubAccount(record.commit?.author?.email ?? "", username);
}

async function commitsMatchGitHubAccount(
  owner: string,
  repo: string,
  username: string,
  branch?: string | null
): Promise<boolean> {
  const params = new URLSearchParams({ per_page: "20" });
  if (branch?.trim()) {
    params.set("sha", branch.trim());
  }

  const response = await githubGet(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${params.toString()}`
  );
  if (!response.ok) {
    return false;
  }

  const commits = (await readJsonResponse(response)) as unknown;
  if (!Array.isArray(commits)) {
    return false;
  }

  return commits.some((commit) =>
    githubCommitMatchesLinkedUsername(commit, username)
  );
}

export function contributionIsLow(input: {
  authoredDistinct: number;
  recentCount: number;
  recentAuthored: number;
}): boolean {
  const share =
    input.recentCount > 0 ? input.recentAuthored / input.recentCount : 0;
  return !(
    input.authoredDistinct >= MIN_AUTHORED_COMMITS ||
    share >= MIN_RECENT_AUTHOR_SHARE
  );
}

function countDistinctCommits(commits: unknown[]): number {
  const shas = new Set<string>();
  for (const commit of commits) {
    if (!commit || typeof commit !== "object") {
      continue;
    }
    const sha = (commit as { sha?: unknown }).sha;
    if (typeof sha === "string" && sha.trim()) {
      shas.add(sha.trim().toLowerCase());
    }
  }
  return shas.size > 0 ? shas.size : commits.length;
}

async function readCommitList(response: Response): Promise<unknown[] | null> {
  if (!response.ok) {
    return null;
  }
  try {
    const body = await readJsonResponse(response);
    return Array.isArray(body) ? body : null;
  } catch (error) {
    console.error("[github-ownership] commit list parse failed:", error);
    return null;
  }
}

/** At least 3 authored commits, or 40% of the latest 20. A failed read does not warn. */
export async function assessContribution(
  owner: string,
  repo: string,
  username: string,
  branch?: string | null
): Promise<{ lowContributionWarning: boolean }> {
  const login = username.trim();
  if (!login) {
    return { lowContributionWarning: false };
  }

  const authoredParams = new URLSearchParams({
    author: login,
    per_page: "3",
  });
  const recentParams = new URLSearchParams({ per_page: "20" });
  if (branch?.trim()) {
    authoredParams.set("sha", branch.trim());
    recentParams.set("sha", branch.trim());
  }

  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits`;

  try {
    const [authoredResponse, recentResponse] = await Promise.all([
      githubGet(`${base}?${authoredParams.toString()}`),
      githubGet(`${base}?${recentParams.toString()}`),
    ]);
    const authored = await readCommitList(authoredResponse);
    const recent = await readCommitList(recentResponse);
    if (!authored || !recent) {
      return { lowContributionWarning: false };
    }

    return {
      lowContributionWarning: contributionIsLow({
        authoredDistinct: countDistinctCommits(authored),
        recentCount: recent.length,
        recentAuthored: recent.filter((commit) =>
          githubCommitMatchesLinkedUsername(commit, login)
        ).length,
      }),
    };
  } catch (error) {
    console.error("[github-ownership] contribution check failed:", error);
    return { lowContributionWarning: false };
  }
}

export async function userHasAuthoredCommits(
  owner: string,
  repo: string,
  username: string,
  branch?: string | null
): Promise<boolean> {
  const params = new URLSearchParams({
    author: username,
    per_page: "1",
  });
  if (branch?.trim()) {
    params.set("sha", branch.trim());
  }

  const response = await githubGet(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${params.toString()}`
  );
  if (!response.ok) {
    return false;
  }

  const commits = (await readJsonResponse(response)) as unknown;
  return Array.isArray(commits) && commits.length > 0;
}

export async function verifyGitHubRepoOwnership(input: {
  user: User;
  repoUrl: string;
}): Promise<RepoOwnershipVerification> {
  const username = githubUsernameFromUser(input.user);
  const parsedPath = parseGitHubRepoPath(input.repoUrl);
  const parsedUrl = parseGitHubUrl(input.repoUrl);
  const owner = parsedPath?.owner ?? parsedUrl?.owner ?? null;
  const repo = parsedPath?.repo ?? parsedUrl?.repo ?? null;

  if (!username || !owner || !repo) {
    return unverifiedOwnership({ username, owner, repo });
  }

  if (repoNamespaceMatchesGitHubUsername(`${owner}/${repo}`, username)) {
    const contribution = await assessContribution(owner, repo, username);
    return {
      verified: true,
      method: "owner",
      username,
      owner,
      repo,
      isFork: false,
      lowContributionWarning: contribution.lowContributionWarning,
    };
  }

  let isFork = false;
  let defaultBranch: string | null = null;

  try {
    const repoResponse = await githubGet(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    );
    if (repoResponse.ok) {
      const payload = (await readJsonResponse(repoResponse)) as {
        fork?: boolean;
        default_branch?: string | null;
      };
      isFork = payload.fork === true;
      defaultBranch = payload.default_branch?.trim() || null;
    }
  } catch (error) {
    console.error("[github-ownership] repo lookup failed:", error);
  }

  let lowContributionWarning = false;
  try {
    const contribution = await assessContribution(
      owner,
      repo,
      username,
      isFork ? defaultBranch : null
    );
    lowContributionWarning = contribution.lowContributionWarning;
    const authored = await userHasAuthoredCommits(
      owner,
      repo,
      username,
      isFork ? defaultBranch : null
    );
    const emailMatch = authored
      ? false
      : await commitsMatchGitHubAccount(
          owner,
          repo,
          username,
          isFork ? defaultBranch : null
        );
    if (authored || emailMatch) {
      return {
        verified: true,
        method: isFork ? "fork_author" : "contributor",
        username,
        owner,
        repo,
        isFork,
        lowContributionWarning,
      };
    }
  } catch (error) {
    console.error("[github-ownership] commit authorship lookup failed:", error);
    return unverifiedOwnership({
      username,
      owner,
      repo,
      isFork,
      lowContributionWarning,
    });
  }

  return unverifiedOwnership({
    username,
    owner,
    repo,
    isFork,
    lowContributionWarning,
  });
}
