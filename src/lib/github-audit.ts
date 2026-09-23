import {
  classifyRepoFilesystem,
  CORE_ARTIFACT_PROBE_DIRS,
  discoverWorkspacePackageDirs,
  emptyRepoFilesystemEvidence,
  WORKSPACE_ROOT_DIRS,
  type RepoFilesystemEvidence,
} from "@/lib/repo-filesystem";
import { readJsonResponse } from "@/lib/read-json-response";

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

  // owner/repo alone are the request target, not proof the repo was readable.
  return Boolean(
    (typeof audit.stars === "number" && Number.isFinite(audit.stars)) ||
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

const ACCESS_DENIED_STATUS = /\((401|403|404)\)/;

export function githubAuditLooksInaccessible(
  artifacts: GitHubArtifactAudit | null | undefined
): boolean {
  if (!artifacts) {
    return true;
  }

  if (githubArtifactAuditSucceeded(artifacts)) {
    return false;
  }

  const warnings = [
    ...artifacts.fetch_warnings,
    ...artifacts.artifacts.flatMap((artifact) => artifact.fetch_warnings),
  ];

  if (warnings.some((warning) => ACCESS_DENIED_STATUS.test(warning))) {
    return true;
  }

  if (artifacts.artifacts.length === 0) {
    return warnings.some((warning) =>
      /No public owned repositories found|No GitHub repository artifacts found|Could not load GitHub profile|timed out or dropped/i.test(
        warning
      )
    );
  }

  // Empty / unreadable tree with no public metadata — treat as private or missing.
  if (
    artifacts.artifacts.every(
      (artifact) =>
        !artifact.filesystem?.inspected &&
        artifact.commit_count_sampled === 0 &&
        !artifact.readme_excerpt?.trim() &&
        artifact.stars == null
    )
  ) {
    return warnings.some((warning) =>
      /file tree could not be inspected|Repo metadata request failed|No GitHub repository artifacts found|No public owned repositories found/i.test(
        warning
      )
    );
  }

  return false;
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

const MAX_WORKSPACE_PACKAGE_TREES = 8;

type GithubDirEntry = {
  name: string;
  path: string;
  sha: string;
  type: "dir" | "file" | "other";
};

function githubContentsUrl(owner: string, repo: string, path: string, ref?: string): string {
  const encoded = path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const base = encoded
    ? `https://api.github.com/repos/${owner}/${repo}/contents/${encoded}`
    : `https://api.github.com/repos/${owner}/${repo}/contents`;
  return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
}

async function listGithubDirEntries(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<GithubDirEntry[]> {
  const response = await githubFetch(githubContentsUrl(owner, repo, path, ref));

  if (!response.ok) {
    return [];
  }

  const payload = (await readJsonResponse(response)) as
    | { path?: string; name?: string; sha?: string; type?: string }
    | Array<{ path?: string; name?: string; sha?: string; type?: string }>;

  const entries = Array.isArray(payload) ? payload : [payload];
  return entries
    .map((entry): GithubDirEntry | null => {
      const name = entry.name?.trim() || "";
      const entryPath =
        entry.path?.trim() || (name ? (path ? `${path}/${name}` : name) : "");
      const sha = entry.sha?.trim() || "";
      if (!entryPath) {
        return null;
      }

      const type =
        entry.type === "dir" ? "dir" : entry.type === "file" ? "file" : "other";
      return { name: name || entryPath, path: entryPath, sha, type };
    })
    .filter((entry): entry is GithubDirEntry => entry !== null);
}

async function listGithubContents(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<string[]> {
  const entries = await listGithubDirEntries(owner, repo, path, ref);
  return entries.map((entry) => entry.path);
}

async function fetchGitSubtreePaths(
  owner: string,
  repo: string,
  treeSha: string,
  pathPrefix: string
): Promise<string[]> {
  const response = await githubFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`
  );

  if (!response.ok) {
    return [];
  }

  const payload = (await readJsonResponse(response)) as {
    tree?: Array<{ path?: string; type?: string }>;
  };
  const prefix = pathPrefix.replace(/\/$/, "");

  return (payload.tree ?? [])
    .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
    .map((entry) => `${prefix}/${entry.path as string}`);
}

async function collectTruncatedTreePaths(
  owner: string,
  repo: string,
  branch: string,
  existingPaths: string[],
  warnings: string[]
): Promise<string[]> {
  const extraPaths: string[] = [];

  const probeResults = await Promise.all(
    CORE_ARTIFACT_PROBE_DIRS.map(async (dir) => {
      try {
        return await listGithubContents(owner, repo, dir, branch);
      } catch (error) {
        console.error(
          `[github-audit] targeted contents fetch failed for ${owner}/${repo}/${dir}:`,
          error
        );
        return [] as string[];
      }
    })
  );
  extraPaths.push(...probeResults.flat());

  const packages = new Map<string, string>();

  for (const dir of discoverWorkspacePackageDirs(
    existingPaths,
    MAX_WORKSPACE_PACKAGE_TREES
  )) {
    packages.set(dir, "");
  }

  const workspaceRoots = await Promise.all(
    WORKSPACE_ROOT_DIRS.map(async (root) => {
      try {
        return await listGithubDirEntries(owner, repo, root, branch);
      } catch (error) {
        console.error(
          `[github-audit] workspace root listing failed for ${owner}/${repo}/${root}:`,
          error
        );
        return [] as GithubDirEntry[];
      }
    })
  );

  for (const entry of workspaceRoots.flat()) {
    if (entry.type === "dir" && entry.sha) {
      packages.set(entry.path, entry.sha);
    }
  }

  const packageList = Array.from(packages.entries()).slice(
    0,
    MAX_WORKSPACE_PACKAGE_TREES
  );

  if (packageList.length > 0) {
    warnings.push(
      `Truncated file tree looked like a monorepo; inspected ${packageList
        .map(([path]) => path)
        .join(", ")} for nested tests, CI, and error-handling files.`
    );
  }

  const subtreeResults = await Promise.all(
    packageList.map(async ([pkgPath, knownSha]) => {
      try {
        const treeSha =
          knownSha ||
          (
            await listGithubDirEntries(
              owner,
              repo,
              pkgPath.includes("/")
                ? pkgPath.slice(0, pkgPath.lastIndexOf("/"))
                : "",
              branch
            )
          ).find((entry) => entry.path === pkgPath && entry.type === "dir")
            ?.sha;

        const nestedDirs = [
          "tests",
          "test",
          "__tests__",
          "src/__tests__",
          "src/test",
          "cypress",
        ];
        const listNestedProbeDirs = async () => {
          const nested = await Promise.all(
            nestedDirs.map((dir) =>
              listGithubContents(owner, repo, `${pkgPath}/${dir}`, branch)
            )
          );
          return nested.flat();
        };

        if (!treeSha) {
          return await listNestedProbeDirs();
        }

        const subtree = await fetchGitSubtreePaths(
          owner,
          repo,
          treeSha,
          pkgPath
        );
        if (subtree.length > 0) {
          return subtree;
        }

        return await listNestedProbeDirs();
      } catch (error) {
        console.error(
          `[github-audit] nested package tree fetch failed for ${owner}/${repo}/${pkgPath}:`,
          error
        );
        return [] as string[];
      }
    })
  );
  extraPaths.push(...subtreeResults.flat());

  return extraPaths;
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

  for (const branch of branches) {
    try {
      const response = await githubFetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
      );

      if (response.status === 404) {
        continue;
      }

      if (!response.ok) {
        warnings.push(
          `File-tree request failed (${response.status}) for ${owner}/${repo}@${branch}.`
        );
        continue;
      }

      const payload = (await readJsonResponse(response)) as {
        truncated?: boolean;
        tree?: Array<{ path?: string; type?: string }>;
      };
      const entries = payload.tree ?? [];
      const paths = entries
        .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
        .map((entry) => entry.path as string);
      const discoveryPaths = entries
        .filter((entry) => typeof entry.path === "string" && entry.path.trim())
        .map((entry) => entry.path as string);

      if (!payload.truncated) {
        return classifyRepoFilesystem(paths, {
          inspected: true,
          truncated: false,
        });
      }

      warnings.push(
        `File-tree listing for ${owner}/${repo} was truncated; nested monorepo packages and alternative test-runner paths were probed so pillar scores are not inferred from a partial tree.`
      );

      const extraPaths = await collectTruncatedTreePaths(
        owner,
        repo,
        branch,
        discoveryPaths,
        warnings
      );

      return classifyRepoFilesystem([...paths, ...extraPaths], {
        inspected: true,
        truncated: true,
      });
    } catch (error) {
      console.error(
        `[github-audit] GitHub file-tree fetch failed for ${owner}/${repo}@${branch}:`,
        error
      );
    }
  }

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
      const repoData = (await readJsonResponse(repoResponse)) as {
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
      const commitsData = (await readJsonResponse(commitsResponse)) as Array<{
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

    const data = (await readJsonResponse(response)) as {
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

    const repos = (await readJsonResponse(response)) as Array<{
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
