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

function parseGitHubRepoUrl(
  url: string
): { owner: string; repo: string } | null {
  try {
    const normalized = url
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "");
    const match = normalized.match(/github\.com\/([^/]+)\/([^/?#]+)/i);
    if (!match) {
      return null;
    }

    const owner = match[1];
    const repo = match[2].replace(/\.git$/i, "");
    if (!owner || !repo || owner === "orgs" || owner === "organizations") {
      return null;
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

export async function fetchGitHubAudit(
  repoUrl: string
): Promise<GitHubAuditContext | null> {
  const parsed = parseGitHubRepoUrl(repoUrl);
  if (!parsed) {
    return null;
  }

  const { owner, repo } = parsed;
  const warnings: string[] = [];
  const base = `https://api.github.com/repos/${owner}/${repo}`;

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
