function normalizeGitHubHost(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

const GITHUB_USERNAME_PATTERN =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9._-]+$/;

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

export function isValidGitHubUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) {
    return false;
  }

  if (/github\.com/i.test(trimmed)) {
    const candidate = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;

    try {
      const url = new URL(candidate);
      return normalizeGitHubHost(url.hostname) === "github.com";
    } catch {
      return true;
    }
  }

  return false;
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
  if (isGitHubPlaceholderInput(trimmed)) {
    return false;
  }

  return isValidGitHubUrl(trimmed) || isValidGitHubHandle(trimmed);
}

export function getGitHubUrlValidationMessage(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return "GitHub profile URL is required";
  }

  return isValidGitHubUrl(trimmed)
    ? null
    : "Enter a valid GitHub URL (e.g. https://github.com/your-handle)";
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

  if (isValidGitHubHandle(trimmed)) {
    return `https://github.com/${trimmed.replace(/^\/+|\/+$/g, "")}`;
  }

  return normalizeGitHubUrl(trimmed);
}
