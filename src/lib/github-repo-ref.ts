export type GitHubRepositoryRef = {
  owner: string;
  repo: string;
  repoUrl: string;
};

const NAME = /^[\w.-]+$/;

/** App routes that sometimes leak into `?repo=` (hash or path). Never treat these as a repo name. */
const TRAILING_PAGE_SEGMENTS = new Set([
  "violations",
  "health",
  "firewall",
  "settings",
  "dashboard",
  "login",
  "signup",
  "onboarding",
  "tree",
  "blob",
  "pulls",
  "issues",
  "actions",
  "commits",
  "branches",
  "tags",
  "releases",
  "wiki",
  "pulse",
  "graphs",
  "network",
  "security",
  "insights",
  "about",
]);

/** Strip a GitHub URL (and any trailing page path) down to `owner/repo` before any API call. */
export function toGitHubOwnerRepo(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 500 || trimmed.includes("\\") || trimmed.includes("\0")) return null;

  let slug = trimmed
    .replace(/[?#].*$/, "")
    .replace(/\/+(?:violations|health|firewall|settings)\/?$/i, "")
    .replace(/\/+$/, "");
  const hosted = slug.match(/^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:www\.)?github\.com\/(.+)$/i);
  if (hosted) {
    slug = hosted[1] ?? "";
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(slug) || /github\.com/i.test(slug)) {
    return null;
  }

  slug = slug.replace(/\/+$/, "").replace(/\.git$/i, "");
  const parts = slug.split("/").filter(Boolean);
  while (parts.length > 2 && TRAILING_PAGE_SEGMENTS.has((parts[parts.length - 1] ?? "").toLowerCase())) {
    parts.pop();
  }
  // GitHub repo refs are exactly owner/repo — drop any leftover path after that.
  const owner = parts[0] ?? "";
  const repoName = (parts[1] ?? "").replace(/\.git$/i, "");
  if (parts.length < 2 || !NAME.test(owner) || !NAME.test(repoName)) return null;
  if (TRAILING_PAGE_SEGMENTS.has(repoName.toLowerCase())) return null;
  return `${owner}/${repoName}`;
}

export function parseGitHubRepository(input: string): GitHubRepositoryRef | null {
  const ownerRepo = toGitHubOwnerRepo(input);
  if (!ownerRepo) return null;
  const [owner, repo] = ownerRepo.split("/");
  return toRef(owner ?? "", repo ?? "");
}

function toRef(owner: string, repo: string): GitHubRepositoryRef | null {
  if (!NAME.test(owner) || !NAME.test(repo)) return null;
  return { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` };
}
