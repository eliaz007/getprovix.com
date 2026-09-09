import {
  classifyRepoFilesystem,
  emptyRepoFilesystemEvidence,
  type RepoFilesystemEvidence,
} from "@/lib/repo-filesystem";

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
  filesystem: RepoFilesystemEvidence;
};

export function emptyGitHubAuditContext(
  overrides: Partial<GitHubAuditContext> & Pick<GitHubAuditContext, "repo_url">
): GitHubAuditContext {
  return {
    owner: "",
    repo: "",
    stars: null,
    forks: null,
    created_at: null,
    language: null,
    commit_count_sampled: 0,
    commit_dates: [],
    readme_excerpt: null,
    fetch_warnings: [],
    filesystem: emptyRepoFilesystemEvidence(),
    ...overrides,
  };
}

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

export function githubAuditHasFetchedArtifacts(
  audit: GitHubAuditContext | null | undefined
): boolean {
  if (!audit) {
    return false;
  }

  return Boolean(
    audit.owner?.trim() ||
      audit.repo?.trim() ||
      (typeof audit.commit_count_sampled === "number" &&
        audit.commit_count_sampled > 0) ||
      audit.readme_excerpt?.trim() ||
      audit.filesystem?.inspected
  );
}

export function githubArtifactAuditSucceeded(
  artifacts: GitHubArtifactAudit | null | undefined
): boolean {
  if (!artifacts) {
    return false;
  }

  return artifacts.artifacts.some((artifact) =>
    githubAuditHasFetchedArtifacts(artifact)
  );
}

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

type GithubHttpFailureDetails = {
  status: number;
  statusText: string;
  message: string | null;
  documentationUrl: string | null;
  rateLimitLimit: string | null;
  rateLimitRemaining: string | null;
  rateLimitReset: string | null;
  rateLimitResource: string | null;
  retryAfter: string | null;
  bodyPreview: string | null;
};

function classifyGithubHttpStatus(status: number): string {
  switch (status) {
    case 401:
      return "auth issue (missing/invalid GITHUB_TOKEN or unauthorized)";
    case 403:
      return "forbidden (rate limit, private repo, or token scope)";
    case 404:
      return "not found (bad URL, missing repo, or wrong branch ref)";
    case 429:
      return "rate limited";
    default:
      return "GitHub API error";
  }
}

function classifyGithubNetworkError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "unknown network/fetch failure";
  }

  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String(error.message) : "";

  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    /timed?\s*out|timeout|aborted/i.test(message)
  ) {
    return `timeout/abort after ${GITHUB_FETCH_TIMEOUT_MS}ms`;
  }

  if (/econnreset|socket hang up|failed to fetch|network/i.test(message)) {
    return "network failure talking to api.github.com";
  }

  return "fetch threw before a GitHub HTTP response";
}

async function readGithubHttpFailure(
  response: Response
): Promise<GithubHttpFailureDetails> {
  const rateLimitLimit = response.headers.get("x-ratelimit-limit");
  const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
  const rateLimitReset = response.headers.get("x-ratelimit-reset");
  const rateLimitResource = response.headers.get("x-ratelimit-resource");
  const retryAfter = response.headers.get("retry-after");

  let message: string | null = null;
  let documentationUrl: string | null = null;
  let bodyPreview: string | null = null;

  try {
    const raw = await response.text();
    bodyPreview = raw.slice(0, 500) || null;

    if (raw.trim()) {
      try {
        const parsed = JSON.parse(raw) as {
          message?: unknown;
          documentation_url?: unknown;
        };
        if (typeof parsed.message === "string" && parsed.message.trim()) {
          message = parsed.message.trim();
        }
        if (
          typeof parsed.documentation_url === "string" &&
          parsed.documentation_url.trim()
        ) {
          documentationUrl = parsed.documentation_url.trim();
        }
      } catch {
        // Non-JSON body — keep the text preview only.
      }
    }
  } catch (error) {
    console.error(
      "[github-audit] failed to read GitHub error response body:",
      error
    );
  }

  return {
    status: response.status,
    statusText: response.statusText,
    message,
    documentationUrl,
    rateLimitLimit,
    rateLimitRemaining,
    rateLimitReset,
    rateLimitResource,
    retryAfter,
    bodyPreview,
  };
}

function logGithubHttpFailure(
  context: string,
  url: string,
  details: GithubHttpFailureDetails,
  extra?: Record<string, unknown>
): void {
  console.error(`[github-audit] ${context}`, {
    url,
    status: details.status,
    statusText: details.statusText,
    classification: classifyGithubHttpStatus(details.status),
    message: details.message,
    documentationUrl: details.documentationUrl,
    rateLimitLimit: details.rateLimitLimit,
    rateLimitRemaining: details.rateLimitRemaining,
    rateLimitReset: details.rateLimitReset,
    rateLimitResource: details.rateLimitResource,
    retryAfter: details.retryAfter,
    bodyPreview: details.bodyPreview,
    ...extra,
  });
}

function formatGithubHttpFailureWarning(
  label: string,
  owner: string,
  repo: string,
  branch: string | null,
  details: GithubHttpFailureDetails
): string {
  const target = branch ? `${owner}/${repo}@${branch}` : `${owner}/${repo}`;
  const githubMessage = details.message
    ? ` GitHub says: ${details.message}`
    : "";
  const rateLimit =
    details.rateLimitRemaining != null
      ? ` Rate limit remaining: ${details.rateLimitRemaining}/${details.rateLimitLimit ?? "?"}.`
      : "";

  return `${label} failed (${details.status} ${details.statusText || ""}) for ${target} — ${classifyGithubHttpStatus(details.status)}.${githubMessage}${rateLimit}`
    .replace(/\s+/g, " ")
    .trim();
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
        const failure = await readGithubHttpFailure(response);
        logGithubHttpFailure(
          `retrying GitHub request after HTTP ${response.status} (attempt ${attempt + 1}/${GITHUB_FETCH_RETRY_COUNT + 1})`,
          url,
          failure,
          { attempt: attempt + 1 }
        );
        await delay(GITHUB_FETCH_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      console.error(
        `[github-audit] fetch attempt ${attempt + 1}/${GITHUB_FETCH_RETRY_COUNT + 1} failed for ${url}:`,
        {
          classification: classifyGithubNetworkError(error),
          name: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
          error,
        }
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

async function listGithubContents(
  owner: string,
  repo: string,
  path: string
): Promise<string[]> {
  const encoded = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encoded}`;
  const response = await githubFetch(url);

  if (!response.ok) {
    const failure = await readGithubHttpFailure(response);
    logGithubHttpFailure(
      `targeted contents fetch failed for ${owner}/${repo}/${path}`,
      url,
      failure,
      { owner, repo, path }
    );
    return [];
  }

  const payload = (await response.json()) as
    | { path?: string; name?: string; type?: string }
    | Array<{ path?: string; name?: string; type?: string }>;

  const entries = Array.isArray(payload) ? payload : [payload];
  return entries
    .map((entry) => {
      if (typeof entry.path === "string" && entry.path.trim()) {
        return entry.path.trim();
      }
      if (typeof entry.name === "string" && entry.name.trim()) {
        return path ? `${path}/${entry.name.trim()}` : entry.name.trim();
      }
      return "";
    })
    .filter(Boolean);
}

async function fetchRepoFilesystem(
  owner: string,
  repo: string,
  defaultBranch: string | null,
  warnings: string[]
): Promise<RepoFilesystemEvidence> {
  const branches = Array.from(
    new Set(
      [defaultBranch, "main", "master"].filter(
        (branch): branch is string => Boolean(branch?.trim())
      )
    )
  );

  console.info(
    `[github-audit] inspecting file tree for ${owner}/${repo}`,
    {
      owner,
      repo,
      defaultBranch,
      branchesTried: branches,
      hasGithubToken: Boolean(process.env.GITHUB_TOKEN?.trim()),
    }
  );

  for (const branch of branches) {
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;

    try {
      const response = await githubFetch(treeUrl);

      if (!response.ok) {
        const failure = await readGithubHttpFailure(response);
        logGithubHttpFailure(
          `GitHub file-tree fetch failed for ${owner}/${repo}@${branch}`,
          treeUrl,
          failure,
          { owner, repo, branch }
        );
        warnings.push(
          formatGithubHttpFailureWarning(
            "File-tree request",
            owner,
            repo,
            branch,
            failure
          )
        );
        continue;
      }

      const payload = (await response.json()) as {
        truncated?: boolean;
        tree?: Array<{ path?: string; type?: string }>;
      };
      const paths = (payload.tree ?? [])
        .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
        .map((entry) => entry.path as string);

      console.info(
        `[github-audit] file-tree fetch succeeded for ${owner}/${repo}@${branch}`,
        {
          pathCount: paths.length,
          truncated: Boolean(payload.truncated),
          rateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
          rateLimitLimit: response.headers.get("x-ratelimit-limit"),
        }
      );

      const evidence = classifyRepoFilesystem(paths, {
        inspected: true,
        truncated: Boolean(payload.truncated),
      });

      if (payload.truncated) {
        warnings.push(
          `File-tree listing for ${owner}/${repo} was truncated; core artifacts were scored only from the returned paths.`
        );

        const extraPaths: string[] = [];
        for (const dir of [
          ".github/workflows",
          "tests",
          "test",
          "__tests__",
          "spec",
          "e2e",
        ]) {
          try {
            extraPaths.push(...(await listGithubContents(owner, repo, dir)));
          } catch (error) {
            console.error(
              `[github-audit] targeted contents fetch threw for ${owner}/${repo}/${dir}:`,
              {
                classification: classifyGithubNetworkError(error),
                name: error instanceof Error ? error.name : typeof error,
                message: error instanceof Error ? error.message : String(error),
                error,
              }
            );
          }
        }

        if (extraPaths.length > 0) {
          return classifyRepoFilesystem([...paths, ...extraPaths], {
            inspected: true,
            truncated: true,
          });
        }
      }

      return evidence;
    } catch (error) {
      console.error(
        `[github-audit] GitHub file-tree fetch threw for ${owner}/${repo}@${branch}:`,
        {
          url: treeUrl,
          classification: classifyGithubNetworkError(error),
          name: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
          error,
        }
      );
      warnings.push(
        `File-tree request threw for ${owner}/${repo}@${branch} — ${classifyGithubNetworkError(error)}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  console.error(
    `[github-audit] repository file tree could not be inspected for ${owner}/${repo}; falling back to empty filesystem evidence (score caps will apply)`,
    {
      owner,
      repo,
      defaultBranch,
      branchesTried: branches,
      warningCount: warnings.length,
    }
  );
  warnings.push(
    "Repository file tree could not be inspected. README and write-ups will not count as substitutes for missing files."
  );
  return emptyRepoFilesystemEvidence();
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
  let defaultBranch: string | null = null;

  try {
    const repoResponse = await githubFetch(base);

    if (repoResponse.ok) {
      const repoData = (await repoResponse.json()) as {
        stargazers_count?: number;
        forks_count?: number;
        created_at?: string;
        language?: string | null;
        default_branch?: string | null;
      };
      stars = repoData.stargazers_count ?? null;
      forks = repoData.forks_count ?? null;
      created_at = repoData.created_at ?? null;
      language = repoData.language ?? null;
      defaultBranch = repoData.default_branch?.trim() || null;
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

  const filesystem = await fetchRepoFilesystem(
    owner,
    repo,
    defaultBranch,
    warnings
  );

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
    filesystem,
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
      return emptyGitHubAuditContext({
        repo_url: repoUrl.trim(),
        owner: parsed?.owner ?? "",
        repo: parsed?.repo ?? "",
        fetch_warnings: artifacts.fetch_warnings,
      });
    }

    return null;
  } catch (error) {
    console.error("[github-audit] fetchGitHubAudit failed:", error);
    const parsed = parseGitHubUrl(repoUrl);
    return emptyGitHubAuditContext({
      repo_url: repoUrl.trim(),
      owner: parsed?.owner ?? "",
      repo: parsed?.repo ?? "",
      fetch_warnings: [
        "The live GitHub audit timed out or dropped. Retry to fetch repository artifacts.",
      ],
    });
  }
}
