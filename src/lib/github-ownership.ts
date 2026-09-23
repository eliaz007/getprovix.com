import { githubUsernameFromUser } from "@/lib/github-identity";
import { parseGitHubUrl } from "@/lib/validate-github-url";
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
    ...overrides,
  };
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
  const parsed = parseGitHubUrl(input.repoUrl);
  const owner = parsed?.owner ?? null;
  const repo = parsed?.repo ?? null;

  if (!username || !owner || !repo) {
    return unverifiedOwnership({ username, owner, repo });
  }

  if (username.toLowerCase() === owner.toLowerCase()) {
    return {
      verified: true,
      method: "owner",
      username,
      owner,
      repo,
      isFork: false,
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

  try {
    const authored = await userHasAuthoredCommits(
      owner,
      repo,
      username,
      isFork ? defaultBranch : null
    );
    if (authored) {
      return {
        verified: true,
        method: isFork ? "fork_author" : "contributor",
        username,
        owner,
        repo,
        isFork,
      };
    }
  } catch (error) {
    console.error("[github-ownership] commit authorship lookup failed:", error);
  }

  return unverifiedOwnership({ username, owner, repo, isFork });
}
