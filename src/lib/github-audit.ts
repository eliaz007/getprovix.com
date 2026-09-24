import {
  analyzeWorkflowDepth,
  countUnhandledAsyncCalls,
  preferSourceSamplePaths,
} from "@/lib/audit-content-signals";
import {
  classifyRepoFilesystem,
  CORE_ARTIFACT_PROBE_DIRS,
  discoverWorkspacePackageDirs,
  emptyRepoFilesystemEvidence,
  isArchitectureSignalPath,
  isCiWorkflowPath,
  isErrorHandlingPath,
  isSourceFile,
  isTestPath,
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
const RETRYABLE_GITHUB_STATUSES = new Set([403, 408, 429, 500, 502, 503, 504]);

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

function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(Math.round(seconds * 1000), 60_000);
    }
    const when = Date.parse(header);
    if (Number.isFinite(when)) {
      return Math.min(Math.max(0, when - Date.now()), 60_000);
    }
  }
  return GITHUB_FETCH_RETRY_DELAY_MS * (attempt + 1);
}

/** A required workflow or source read failed. Scoring must stop instead of treating the file as missing. */
export class GithubContentReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubContentReadError";
  }
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
        const waitMs = retryDelayMs(response, attempt);
        const failure = await readGithubHttpFailure(response);
        logGithubHttpFailure(
          `retrying GitHub request after HTTP ${response.status} (attempt ${attempt + 1}/${GITHUB_FETCH_RETRY_COUNT + 1})`,
          url,
          failure,
          { attempt: attempt + 1, waitMs }
        );
        await delay(waitMs);
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

const MAX_WORKSPACE_PACKAGE_TREES = 2;
const MAX_RAW_FILE_CHARS = 4_000;
const MAX_RECURSIVE_BLOB_PATHS = 2_000;
const MAX_PROBE_DIR_SEGMENTS = 2;
const MAX_TREE_PATH_SEGMENTS = 12;

function isSafeRepoPath(path: string, maxSegments = MAX_TREE_PATH_SEGMENTS): boolean {
  const normalized = path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.includes("\0")) {
    return false;
  }

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0 || segments.length > maxSegments) {
    return false;
  }

  return segments.every(
    (segment) => segment !== "." && segment !== ".." && !segment.includes("..")
  );
}

function pathStaysWithin(dir: string, path: string): boolean {
  if (!isSafeRepoPath(dir) || !isSafeRepoPath(path)) {
    return false;
  }

  return path === dir || path.startsWith(`${dir}/`);
}

function boundedCoreArtifactProbeDirs(): string[] {
  return CORE_ARTIFACT_PROBE_DIRS.filter(
    (dir) =>
      isSafeRepoPath(dir, MAX_PROBE_DIR_SEGMENTS) &&
      (CORE_ARTIFACT_PROBE_DIRS as readonly string[]).includes(dir)
  );
}

function isPriorityBlobPath(path: string): boolean {
  return (
    isTestPath(path) ||
    isCiWorkflowPath(path) ||
    isErrorHandlingPath(path) ||
    isArchitectureSignalPath(path)
  );
}

function capRecursiveBlobPaths(paths: string[]): string[] {
  if (paths.length <= MAX_RECURSIVE_BLOB_PATHS) {
    return paths;
  }

  const priorityIndexes: number[] = [];
  for (let index = 0; index < paths.length; index += 1) {
    if (isPriorityBlobPath(paths[index])) {
      priorityIndexes.push(index);
    }
  }

  const mustKeep = new Set(priorityIndexes.slice(0, MAX_RECURSIVE_BLOB_PATHS));
  const fillerBudget = MAX_RECURSIVE_BLOB_PATHS - mustKeep.size;
  const capped: string[] = [];
  let fillers = 0;

  for (let index = 0; index < paths.length && capped.length < MAX_RECURSIVE_BLOB_PATHS; index += 1) {
    if (mustKeep.has(index)) {
      capped.push(paths[index]);
      continue;
    }

    if (fillers < fillerBudget) {
      capped.push(paths[index]);
      fillers += 1;
    }
  }

  return capped;
}

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
  if (!isSafeRepoPath(prefix)) {
    return [];
  }

  const blobs = (payload.tree ?? []).flatMap((entry) => {
    if (entry.type !== "blob" || typeof entry.path !== "string") {
      return [];
    }

    const relative = entry.path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if (!isSafeRepoPath(relative)) {
      return [];
    }

    const fullPath = `${prefix}/${relative}`;
    return pathStaysWithin(prefix, fullPath) ? [fullPath] : [];
  });

  return capRecursiveBlobPaths(blobs);
}

async function collectTruncatedTreePaths(
  owner: string,
  repo: string,
  branch: string,
  existingPaths: string[],
  warnings: string[]
): Promise<string[]> {
  const extraPaths: string[] = [];

  const probeDirs = boundedCoreArtifactProbeDirs();
  const probeResults = await Promise.all(
    probeDirs.map(async (dir) => {
      try {
        const listed = await listGithubContents(owner, repo, dir, branch);
        return listed.filter((path) => pathStaysWithin(dir, path));
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
    if (isSafeRepoPath(dir)) {
      packages.set(dir, "");
    }
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
    if (entry.type === "dir" && entry.sha && isSafeRepoPath(entry.path)) {
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

        const nestedDirs = probeDirs.filter((dir) =>
          [
            "tests",
            "test",
            "__tests__",
            "src/__tests__",
            "src/test",
            "cypress",
          ].includes(dir)
        );
        const listNestedProbeDirs = async () => {
          if (!isSafeRepoPath(pkgPath)) {
            return [] as string[];
          }

          const nested = await Promise.all(
            nestedDirs.map(async (dir) => {
              const probePath = `${pkgPath}/${dir}`;
              if (!pathStaysWithin(pkgPath, probePath)) {
                return [] as string[];
              }

              const listed = await listGithubContents(
                owner,
                repo,
                probePath,
                branch
              );
              return listed.filter((path) => pathStaysWithin(probePath, path));
            })
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

const MAX_WORKFLOW_SAMPLES = 3;
const MAX_SOURCE_SAMPLES = 6;

async function fetchGithubFileRaw(
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string> {
  const target = `${owner}/${repo}@${ref}:${path}`;
  let response: Response;
  try {
    response = await githubFetch(githubContentsUrl(owner, repo, path, ref), {
      headers: { Accept: "application/vnd.github.raw" },
    });
  } catch (error) {
    throw new GithubContentReadError(
      `GitHub file read failed for ${target} (${classifyGithubNetworkError(error)}). The audit was not scored, so a dropped sample cannot lower DevOps or Resilience.`
    );
  }

  if (response.status === 403 || response.status === 429 || !response.ok) {
    const failure = await readGithubHttpFailure(response);
    throw new GithubContentReadError(
      `GitHub file read failed for ${target} (HTTP ${failure.status}). The audit was not scored, so a dropped sample cannot lower DevOps or Resilience.`
    );
  }

  const text = await response.text();
  return text.slice(0, MAX_RAW_FILE_CHARS);
}

async function enrichFilesystemFromContents(
  evidence: RepoFilesystemEvidence,
  allPaths: string[],
  owner: string,
  repo: string,
  commitSha: string
): Promise<RepoFilesystemEvidence> {
  const workflowPaths = evidence.ci_workflow_paths
    .filter(isCiWorkflowPath)
    .slice(0, MAX_WORKFLOW_SAMPLES);
  const sourcePaths = preferSourceSamplePaths(
    allPaths.filter(isSourceFile),
    MAX_SOURCE_SAMPLES
  );

  const [workflowTexts, sourceTexts] = await Promise.all([
    Promise.all(
      workflowPaths.map((path) =>
        fetchGithubFileRaw(owner, repo, path, commitSha)
      )
    ),
    Promise.all(
      sourcePaths.map((path) => fetchGithubFileRaw(owner, repo, path, commitSha))
    ),
  ]);

  const readableWorkflows = workflowTexts.filter(
    (text): text is string => Boolean(text)
  );
  const readableSources = sourceTexts.filter(
    (text): text is string => Boolean(text)
  );

  const contentDepth =
    readableWorkflows.length > 0
      ? analyzeWorkflowDepth(readableWorkflows)
      : evidence.ci_depth;
  const unhandled = readableSources.reduce(
    (sum, text) => sum + countUnhandledAsyncCalls(text),
    0
  );

  return {
    ...evidence,
    ci_depth: contentDepth,
    unhandled_async_count: unhandled,
    resilience_sampled: readableSources.length > 0,
  };
}

async function resolvePinnedCommitSha(
  owner: string,
  repo: string,
  branch: string
): Promise<string | null> {
  const refUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`;
  const response = await githubFetch(refUrl, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const failure = await readGithubHttpFailure(response);
    throw new GithubContentReadError(
      `Could not pin ${owner}/${repo}@${branch} to a commit SHA (HTTP ${failure.status}). The audit was not scored against a moving branch.`
    );
  }

  const payload = (await readJsonResponse(response)) as { sha?: string };
  const sha = payload.sha?.trim() ?? "";
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new GithubContentReadError(
      `GitHub did not return a commit SHA for ${owner}/${repo}@${branch}. The audit was not scored.`
    );
  }

  return sha;
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
    let commitSha: string | null;
    try {
      commitSha = await resolvePinnedCommitSha(owner, repo, branch);
    } catch (error) {
      if (error instanceof GithubContentReadError) {
        throw error;
      }
      throw new GithubContentReadError(
        `Could not pin ${owner}/${repo}@${branch} to a commit SHA (${classifyGithubNetworkError(error)}). The audit was not scored against a moving branch.`
      );
    }

    if (!commitSha) {
      warnings.push(
        `No commit SHA for ${owner}/${repo}@${branch}. Trying the next branch.`
      );
      continue;
    }

    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`;

    try {
      warnings.push(`Pinned audit to commit ${commitSha} (${branch}).`);
      const response = await githubFetch(treeUrl);

      if (!response.ok) {
        const failure = await readGithubHttpFailure(response);
        logGithubHttpFailure(
          `GitHub file-tree fetch failed for ${owner}/${repo}@${commitSha}`,
          treeUrl,
          failure,
          { owner, repo, branch, commitSha }
        );
        if (failure.status === 403 || failure.status === 429) {
          throw new GithubContentReadError(
            `GitHub file-tree read failed for ${owner}/${repo}@${commitSha} (HTTP ${failure.status}). The audit was not scored, so a partial tree cannot lower DevOps or Resilience.`
          );
        }
        warnings.push(
          formatGithubHttpFailureWarning(
            "File-tree request",
            owner,
            repo,
            commitSha,
            failure
          )
        );
        continue;
      }

      const payload = (await readJsonResponse(response)) as {
        truncated?: boolean;
        tree?: Array<{ path?: string; type?: string }>;
      };
      const entries = payload.tree ?? [];
      const paths = capRecursiveBlobPaths(
        entries
          .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
          .map((entry) => entry.path as string)
          .filter((path) => isSafeRepoPath(path))
      );
      const discoveryPaths = entries
        .filter((entry) => typeof entry.path === "string" && entry.path.trim())
        .map((entry) => entry.path as string)
        .filter((path) => isSafeRepoPath(path));

      if (!payload.truncated) {
        const classified = classifyRepoFilesystem(paths, {
          inspected: true,
          truncated: false,
        });
        return enrichFilesystemFromContents(
          classified,
          paths,
          owner,
          repo,
          commitSha
        );
      }

      warnings.push(
        `File-tree listing for ${owner}/${repo} was truncated; nested monorepo packages and alternative test-runner paths were probed so pillar scores are not inferred from a partial tree.`
      );

      const extraPaths = await collectTruncatedTreePaths(
        owner,
        repo,
        commitSha,
        discoveryPaths,
        warnings
      );

      const merged = capRecursiveBlobPaths([...paths, ...extraPaths]);
      const classified = classifyRepoFilesystem(merged, {
        inspected: true,
        truncated: true,
      });
      return enrichFilesystemFromContents(
        classified,
        merged,
        owner,
        repo,
        commitSha
      );
    } catch (error) {
      if (error instanceof GithubContentReadError) {
        throw error;
      }
      throw new GithubContentReadError(
        `GitHub file-tree read failed for ${owner}/${repo}@${commitSha} (${classifyGithubNetworkError(error)}). The audit was not scored, so a partial tree cannot lower DevOps or Resilience.`
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

type RepoMetadataFetch = {
  stars: number | null;
  forks: number | null;
  created_at: string | null;
  language: string | null;
  defaultBranch: string | null;
  warnings: string[];
};

async function fetchRepoMetadata(
  base: string,
  owner: string,
  repo: string
): Promise<RepoMetadataFetch> {
  try {
    const repoResponse = await githubFetch(base);

    if (!repoResponse.ok) {
      return {
        stars: null,
        forks: null,
        created_at: null,
        language: null,
        defaultBranch: null,
        warnings: [
          `Repo metadata request failed (${repoResponse.status}) for ${owner}/${repo}.`,
        ],
      };
    }

    const repoData = (await readJsonResponse(repoResponse)) as {
      stargazers_count?: number;
      forks_count?: number;
      created_at?: string;
      language?: string | null;
      default_branch?: string | null;
    };

    return {
      stars: repoData.stargazers_count ?? null,
      forks: repoData.forks_count ?? null,
      created_at: repoData.created_at ?? null,
      language: repoData.language ?? null,
      defaultBranch: repoData.default_branch?.trim() || null,
      warnings: [],
    };
  } catch (error) {
    console.error("[github-audit] GitHub repo fetch failed:", error);
    return {
      stars: null,
      forks: null,
      created_at: null,
      language: null,
      defaultBranch: null,
      warnings: [
        "Repository metadata timed out or dropped. Retry the live audit to fetch GitHub artifacts.",
      ],
    };
  }
}

async function fetchRepoCommitSummaries(
  base: string,
  owner: string,
  repo: string
): Promise<{ commits: Array<{ date: string }>; warnings: string[] }> {
  try {
    const commitsResponse = await githubFetch(`${base}/commits?per_page=10`);

    if (!commitsResponse.ok) {
      return {
        commits: [],
        warnings: [
          `Commit history request failed (${commitsResponse.status}) for ${owner}/${repo}.`,
        ],
      };
    }

    const commitsData = (await readJsonResponse(commitsResponse)) as Array<{
      commit?: { author?: { date?: string } };
    }>;
    const commits: Array<{ date: string }> = [];

    for (const entry of commitsData) {
      commits.push({
        date: entry.commit?.author?.date ?? "unknown",
      });
    }

    return { commits, warnings: [] };
  } catch (error) {
    console.error("[github-audit] GitHub commits fetch failed:", error);
    return {
      commits: [],
      warnings: [
        "Commit history timed out or dropped during the GitHub fetch sequence.",
      ],
    };
  }
}

async function fetchRepoReadmeExcerpt(
  base: string
): Promise<{ excerpt: string | null; warnings: string[] }> {
  try {
    const readmeResponse = await githubFetch(`${base}/readme`, {
      headers: {
        Accept: "application/vnd.github.raw",
      },
    });

    if (!readmeResponse.ok) {
      return { excerpt: null, warnings: [] };
    }

    const readmeText = await readmeResponse.text();
    return { excerpt: readmeText.slice(0, 2000), warnings: [] };
  } catch (error) {
    console.error("[github-audit] GitHub readme fetch failed:", error);
    return {
      excerpt: null,
      warnings: ["README timed out or could not be fetched."],
    };
  }
}

async function fetchRepoAudit(
  owner: string,
  repo: string
): Promise<GitHubAuditContext> {
  const warnings: string[] = [];
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const repoUrl = `https://github.com/${owner}/${repo}`;

  const [metadata, commitSummaries, readme] = await Promise.all([
    fetchRepoMetadata(base, owner, repo),
    fetchRepoCommitSummaries(base, owner, repo),
    fetchRepoReadmeExcerpt(base),
  ]);

  warnings.push(
    ...metadata.warnings,
    ...commitSummaries.warnings,
    ...readme.warnings
  );

  const filesystem = await fetchRepoFilesystem(
    owner,
    repo,
    metadata.defaultBranch,
    warnings
  );

  return {
    repo_url: repoUrl,
    owner,
    repo,
    stars: metadata.stars,
    forks: metadata.forks,
    created_at: metadata.created_at,
    language: metadata.language,
    commit_count_sampled: commitSummaries.commits.length,
    commit_dates: commitSummaries.commits.map((commit) => commit.date),
    readme_excerpt: readme.excerpt,
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

    if (!parsed.repo) {
      return null;
    }

    const targets = [{ owner: parsed.owner, repo: parsed.repo }];

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
    if (error instanceof GithubContentReadError) {
      throw error;
    }
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
    if (error instanceof GithubContentReadError) {
      throw error;
    }
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
