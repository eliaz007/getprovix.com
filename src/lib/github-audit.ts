export type GitHubAuditContext = {
  repo_url: string;
  owner: string;
  repo: string;
  stars: number | null;
  forks: number | null;
  created_at: string | null;
  language: string | null;
  commit_count_sampled: number;
  commit_dates: string[];
  readme_excerpt: string | null;
  fetch_warnings: string[];
};

export type GitHubProfileContext = {
  username: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  public_repos: number | null;
  created_at: string | null;
};

export type GitHubArtifactAudit = {
  source_url: string;
  profile: GitHubProfileContext | null;
  artifacts: GitHubAuditContext[];
  fetch_warnings: string[];
};

const GITHUB_FETCH_TIMEOUT_MS = 20_000;
const GITHUB_FETCH_RETRY_COUNT = 2;
const GITHUB_FETCH_RETRY_DELAY_MS = 500;
const RETRYABLE_GITHUB_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

const RESERVED_GITHUB_OWNERS = new Set([
  "orgs",
  "organizations",
  "settings",
  "login",
  "signup",
  "topics",
  "features",
  "marketplace",
  "explore",
  "notifications",
  "new",
  "codespaces",
  "pulls",
  "issues",
  "stars",
  "sponsors",
  "about",
  "pricing",
  "blog",
]);

type ParsedGitHubUrl = {
  owner: string;
  repo: string | null;
};

function parseGitHubUrl(url: string): ParsedGitHubUrl | null {
  try {
    const normalized = url
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "");
    const match = normalized.match(/^github\.com\/([^/?#]+)(?:\/([^/?#]+))?/i);
    if (!match) {
      return null;
    }

    const owner = match[1];
    const repo = match[2] ? match[2].replace(/\.git$/i, "") : null;

    if (!owner || RESERVED_GITHUB_OWNERS.has(owner.toLowerCase())) {
      return null;
    }

    if (repo && RESERVED_GITHUB_OWNERS.has(repo.toLowerCase())) {
      return { owner, repo: null };
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Provix-OpportunityMatch/1.0",
  };

  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function isRetryableGithubError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const name = "name" in error ? String(error.name) : "";
  if (name === "AbortError" || name === "TimeoutError") {
    return true;
  }

  if (error instanceof TypeError) {
    return true;
  }

  const message = "message" in error ? String(error.message) : "";
  return /aborted|timed?\s*out|timeout|failed to fetch|network|econnreset|socket hang up/i.test(
    message
  );
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function githubFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= GITHUB_FETCH_RETRY_COUNT; attempt++) {
    try {
      const headers = new Headers(githubHeaders());
      const extraHeaders = new Headers(init.headers);
      extraHeaders.forEach((value, key) => {
        headers.set(key, value);
      });

      const response = await fetch(url, {
        ...init,
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
      });

      if (
        RETRYABLE_GITHUB_STATUSES.has(response.status) &&
        attempt < GITHUB_FETCH_RETRY_COUNT
      ) {
        await delay(GITHUB_FETCH_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      console.error(
        `[github-audit] fetch attempt ${attempt + 1} failed for ${url}:`,
        error
      );

      if (
        !isRetryableGithubError(error) ||
        attempt === GITHUB_FETCH_RETRY_COUNT
      ) {
        throw error;
      }

      await delay(GITHUB_FETCH_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("GitHub fetch failed after retries.");
}

async function fetchRepoAudit(
  owner: string,
  repo: string
): Promise<GitHubAuditContext> {
  const warnings: string[] = [];
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const repoUrl = `https://github.com/${owner}/${repo}`;

  let stars: number | null = null;
  let forks: number | null = null;
  let created_at: string | null = null;
  let language: string | null = null;

  try {
    const repoResponse = await githubFetch(base);

    if (repoResponse.ok) {
      const repoData = (await repoResponse.json()) as {
        stargazers_count?: number;
        forks_count?: number;
        created_at?: string;
        language?: string | null;
      };
      stars = repoData.stargazers_count ?? null;
      forks = repoData.forks_count ?? null;
      created_at = repoData.created_at ?? null;
      language = repoData.language ?? null;
    } else {
      warnings.push(
        `Repo metadata request failed (${repoResponse.status}) for ${owner}/${repo}.`
      );
    }
  } catch (error) {
    console.error("[github-audit] GitHub repo fetch failed:", error);
    warnings.push(
      "Repository metadata timed out or dropped. Retry the live audit to fetch GitHub artifacts."
    );
  }

  const commitSummaries: Array<{ date: string }> = [];

  try {
    const commitsResponse = await githubFetch(`${base}/commits?per_page=10`);

    if (commitsResponse.ok) {
      const commitsData = (await commitsResponse.json()) as Array<{
        commit?: { author?: { date?: string } };
      }>;

      for (const entry of commitsData) {
        commitSummaries.push({
          date: entry.commit?.author?.date ?? "unknown",
        });
      }
    } else {
      warnings.push(
        `Commit history request failed (${commitsResponse.status}) for ${owner}/${repo}.`
      );
    }
  } catch (error) {
    console.error("[github-audit] GitHub commits fetch failed:", error);
    warnings.push(
      "Commit history timed out or dropped during the GitHub fetch sequence."
    );
  }

  let readme_excerpt: string | null = null;

  try {
    const readmeResponse = await githubFetch(`${base}/readme`, {
      headers: {
        Accept: "application/vnd.github.raw",
      },
    });

    if (readmeResponse.ok) {
      const readmeText = await readmeResponse.text();
      readme_excerpt = readmeText.slice(0, 2000);
    }
  } catch (error) {
    console.error("[github-audit] GitHub readme fetch failed:", error);
    warnings.push("README timed out or could not be fetched.");
  }

  return {
    repo_url: repoUrl,
    owner,
    repo,
    stars,
    forks,
    created_at,
    language,
    commit_count_sampled: commitSummaries.length,
    commit_dates: commitSummaries.map((commit) => commit.date),
    readme_excerpt,
    fetch_warnings: warnings,
  };
}

async function fetchGitHubUser(
  username: string
): Promise<GitHubProfileContext | null> {
  try {
    const response = await githubFetch(`https://api.github.com/users/${username}`);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      login?: string;
      name?: string | null;
      bio?: string | null;
      company?: string | null;
      public_repos?: number;
      created_at?: string | null;
    };

    return {
      username: data.login?.trim() || username,
      name: data.name?.trim() || null,
      bio: data.bio?.trim() || null,
      company: data.company?.trim() || null,
      public_repos: data.public_repos ?? null,
      created_at: data.created_at ?? null,
    };
  } catch (error) {
    console.error("[github-audit] GitHub user fetch failed:", error);
    return null;
  }
}

async function fetchTopOwnedRepos(
  username: string,
  limit = 3
): Promise<Array<{ owner: string; repo: string }>> {
  try {
    const response = await githubFetch(
      `https://api.github.com/users/${username}/repos?sort=updated&per_page=8&type=owner`
    );

    if (!response.ok) {
      return [];
    }

    const repos = (await response.json()) as Array<{
      name?: string;
      full_name?: string;
      fork?: boolean;
      stargazers_count?: number;
      pushed_at?: string | null;
    }>;

    return repos
      .filter((repo) => repo.name && repo.fork !== true)
      .sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
      .slice(0, limit)
      .map((repo) => ({
        owner: username,
        repo: repo.name as string,
      }));
  } catch (error) {
    console.error("[github-audit] GitHub repos list failed:", error);
    return [];
  }
}

export async function fetchGitHubProfileArtifacts(
  url: string
): Promise<GitHubArtifactAudit | null> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    return null;
  }

  try {
    const warnings: string[] = [];
    const profile = await fetchGitHubUser(parsed.owner);
    if (!profile) {
      warnings.push(`Could not load GitHub profile for ${parsed.owner}.`);
    }

    const targets = parsed.repo
      ? [{ owner: parsed.owner, repo: parsed.repo }]
      : await fetchTopOwnedRepos(parsed.owner, 3);

    if (targets.length === 0) {
      warnings.push(
        parsed.repo
          ? `No GitHub repository artifacts found for ${parsed.owner}/${parsed.repo}.`
          : `No public owned repositories found for ${parsed.owner}.`
      );
    }

    const artifacts = await Promise.all(
      targets.map((target) => fetchRepoAudit(target.owner, target.repo))
    );

    for (const artifact of artifacts) {
      warnings.push(...artifact.fetch_warnings);
    }

    return {
      source_url: url.trim(),
      profile,
      artifacts,
      fetch_warnings: warnings,
    };
  } catch (error) {
    console.error("[github-audit] GitHub artifact sequence failed:", error);
    return {
      source_url: url.trim(),
      profile: null,
      artifacts: [],
      fetch_warnings: [
        "The GitHub fetch sequence timed out or dropped. Retry the live audit to reload repository artifacts.",
      ],
    };
  }
}

export async function fetchGitHubAudit(
  repoUrl: string
): Promise<GitHubAuditContext | null> {
  try {
    const artifacts = await fetchGitHubProfileArtifacts(repoUrl);
    const primary = artifacts?.artifacts[0];
    if (primary) {
      return primary;
    }

    if (artifacts?.fetch_warnings.length) {
      const parsed = parseGitHubUrl(repoUrl);
      return {
        repo_url: repoUrl.trim(),
        owner: parsed?.owner ?? "",
        repo: parsed?.repo ?? "",
        stars: null,
        forks: null,
        created_at: null,
        language: null,
        commit_count_sampled: 0,
        commit_dates: [],
        readme_excerpt: null,
        fetch_warnings: artifacts.fetch_warnings,
      };
    }

    return null;
  } catch (error) {
    console.error("[github-audit] fetchGitHubAudit failed:", error);
    const parsed = parseGitHubUrl(repoUrl);
    return {
      repo_url: repoUrl.trim(),
      owner: parsed?.owner ?? "",
      repo: parsed?.repo ?? "",
      stars: null,
      forks: null,
      created_at: null,
      language: null,
      commit_count_sampled: 0,
      commit_dates: [],
      readme_excerpt: null,
      fetch_warnings: [
        "The live GitHub audit timed out or dropped. Retry to fetch repository artifacts.",
      ],
    };
  }
}
