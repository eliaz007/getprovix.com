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
    const repoResponse = await fetch(base, {
      headers: githubHeaders(),
      next: { revalidate: 300 },
    });

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
    warnings.push("Could not fetch GitHub repository metadata.");
  }

  const commitSummaries: Array<{ date: string }> = [];

  try {
    const commitsResponse = await fetch(`${base}/commits?per_page=10`, {
      headers: githubHeaders(),
      next: { revalidate: 300 },
    });

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
    warnings.push("Could not fetch GitHub commit activity.");
  }

  let readme_excerpt: string | null = null;

  try {
    const readmeResponse = await fetch(`${base}/readme`, {
      headers: {
        ...githubHeaders(),
        Accept: "application/vnd.github.raw",
      },
      next: { revalidate: 300 },
    });

    if (readmeResponse.ok) {
      const readmeText = await readmeResponse.text();
      readme_excerpt = readmeText.slice(0, 2000);
    }
  } catch (error) {
    console.error("[github-audit] GitHub readme fetch failed:", error);
    warnings.push("README not available or could not be fetched.");
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
    const response = await fetch(`https://api.github.com/users/${username}`, {
      headers: githubHeaders(),
      next: { revalidate: 300 },
    });

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
    const response = await fetch(
      `https://api.github.com/users/${username}/repos?sort=updated&per_page=8&type=owner`,
      {
        headers: githubHeaders(),
        next: { revalidate: 300 },
      }
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
}

export async function fetchGitHubAudit(
  repoUrl: string
): Promise<GitHubAuditContext | null> {
  const artifacts = await fetchGitHubProfileArtifacts(repoUrl);
  return artifacts?.artifacts[0] ?? null;
}
