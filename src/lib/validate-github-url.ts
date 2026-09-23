function normalizeGitHubHost(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

const GITHUB_USERNAME_PATTERN =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9._-]+$/;

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

const GITHUB_AUDIT_PLACEHOLDERS = new Set([
  "https://github.com/your-handle or repo url",
  "https://github.com/your-handle or repo url.",
  "https://github.com/your-handle",
  "http://github.com/your-handle",
  "github.com/your-handle",
  "www.github.com/your-handle",
  "your-handle",
  "optional — leave blank for private/enterprise work",
  "optional - leave blank for private/enterprise work",
]);

export const AUDIT_MISSING_GITHUB_OR_ARTIFACT_MESSAGE =
  "Please provide a valid GitHub repository or add a private project artifact to run an audit.";

export const INVALID_REPO_FORMAT = "INVALID_REPO_FORMAT";
export const INVALID_REPO_FORMAT_MESSAGE =
  "INVALID_REPO_FORMAT: Please provide a full repository path (e.g., username/repository-name).";
export const INVALID_REPO_FORMAT_HINT =
  "⚠️ Enter a specific repository name (e.g. owner/project), not just a username or profile.";

const GITHUB_URL_HINT =
  "Enter a valid GitHub URL starting with https://github.com/ (profile or owner/repo).";

function toGitHubUrlCandidate(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^(www\.)?github\.com\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return null;
}

export function isGitHubPlaceholderInput(input: string | null | undefined): boolean {
  const normalized = (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/\/+$/, "");

  if (!normalized) {
    return true;
  }

  return GITHUB_AUDIT_PLACEHOLDERS.has(normalized);
}

/** Strip protocol, github.com host, and trailing slashes for slug checks. */
export function normalizeGitHubRepoSlug(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?github\.com\/?/i, "")
    .replace(/\/+$/g, "");
}

export function parseGitHubRepoPath(
  input: string
): { owner: string; repo: string } | null {
  if (isGitHubPlaceholderInput(input)) {
    return null;
  }

  const slug = normalizeGitHubRepoSlug(input);
  if (!slug || /\s/.test(slug)) {
    return null;
  }

  const segments = slug.split("/").filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  if (
    !owner ||
    !repo ||
    RESERVED_GITHUB_OWNERS.has(owner.toLowerCase()) ||
    !GITHUB_USERNAME_PATTERN.test(owner) ||
    repo === "." ||
    repo === ".." ||
    !GITHUB_REPO_PATTERN.test(repo)
  ) {
    return null;
  }

  return { owner, repo };
}

export function isGitHubUsernameOnlyInput(
  input: string | null | undefined
): boolean {
  const trimmed = input?.trim() ?? "";
  if (!trimmed || isGitHubPlaceholderInput(trimmed)) {
    return false;
  }

  const slug = normalizeGitHubRepoSlug(trimmed);
  if (!slug || /\s/.test(slug)) {
    return false;
  }

  const segments = slug.split("/").filter(Boolean);
  if (segments.length !== 1) {
    return false;
  }

  const owner = segments[0];
  return (
    Boolean(owner) &&
    !RESERVED_GITHUB_OWNERS.has(owner.toLowerCase()) &&
    GITHUB_USERNAME_PATTERN.test(owner)
  );
}

export function parseGitHubUrl(input: string): { owner: string; repo: string | null } | null {
  if (isGitHubPlaceholderInput(input)) {
    return null;
  }

  const candidate = toGitHubUrlCandidate(input);
  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);
    if (normalizeGitHubHost(url.hostname) !== "github.com") {
      return null;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 1) {
      return null;
    }

    const owner = segments[0];
    if (
      !owner ||
      RESERVED_GITHUB_OWNERS.has(owner.toLowerCase()) ||
      !GITHUB_USERNAME_PATTERN.test(owner)
    ) {
      return null;
    }

    if (segments.length === 1) {
      return { owner, repo: null };
    }

    const repo = segments[1].replace(/\.git$/i, "");
    if (!repo || repo === "." || repo === ".." || !GITHUB_REPO_PATTERN.test(repo)) {
      return null;
    }

    if (RESERVED_GITHUB_OWNERS.has(repo.toLowerCase())) {
      return { owner, repo: null };
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

export function isValidGitHubUrl(input: string): boolean {
  return parseGitHubUrl(input) !== null;
}

export function isValidGitHubHandle(input: string): boolean {
  const trimmed = input.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed || /\s/.test(trimmed) || /^(https?:)?\/\//i.test(trimmed)) {
    return false;
  }

  const parts = trimmed.split("/");
  if (parts.length < 1 || parts.length > 2) {
    return false;
  }

  const owner = parts[0];
  if (!owner || !GITHUB_USERNAME_PATTERN.test(owner)) {
    return false;
  }

  if (parts.length === 2) {
    const repo = parts[1].replace(/\.git$/i, "");
    if (!repo || repo === "." || repo === ".." || !GITHUB_REPO_PATTERN.test(repo)) {
      return false;
    }
  }

  return true;
}

export function hasUsableGitHubAuditTarget(
  input: string | null | undefined
): boolean {
  const trimmed = input?.trim() ?? "";
  if (!trimmed || isGitHubPlaceholderInput(trimmed)) {
    return false;
  }

  return parseGitHubRepoPath(trimmed) !== null;
}

export function getGitHubUrlValidationMessage(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return "GitHub profile URL is required";
  }

  return isValidGitHubUrl(trimmed) ? null : GITHUB_URL_HINT;
}

export function normalizeGitHubUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

export function normalizeGitHubAuditTarget(
  input: string | null | undefined
): string {
  const trimmed = input?.trim() ?? "";
  if (!hasUsableGitHubAuditTarget(trimmed)) {
    return "";
  }

  const parsed = parseGitHubRepoPath(trimmed);
  return parsed ? `https://github.com/${parsed.owner}/${parsed.repo}` : "";
}

export function githubUrlFromSearchParam(
  value: string | string[] | undefined
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim();
}

export function githubUrlFromAuditQuery(params: {
  repo?: string | string[];
  github?: string | string[];
}): string {
  return (
    githubUrlFromSearchParam(params.repo) ||
    githubUrlFromSearchParam(params.github)
  );
}
