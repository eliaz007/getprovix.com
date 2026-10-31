import { Octokit } from "@octokit/rest";
import { parseGitHubRepository } from "@/lib/github-repo-ref";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

export function isFirewallSourcePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return false;
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "node_modules" || part.startsWith("."))) {
    return false;
  }
  const dot = normalized.lastIndexOf(".");
  if (dot === -1) return false;
  return SOURCE_EXTENSIONS.has(normalized.slice(dot));
}

/** Source, package.json, and env files a security fix is allowed to read or write. */
export function isRepositoryTextPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return false;
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part === "node_modules" || part === ".git")) {
    return false;
  }
  const name = parts[parts.length - 1] ?? "";
  if (name === "package.json" || name === ".env.example") return true;
  if (name === ".env" || /^\.env\.[A-Za-z0-9._-]+$/.test(name)) return true;
  return /\.(?:ts|tsx|js|jsx|json)$/.test(name);
}

export async function readGitHubSourceFile(
  repoInput: string,
  filePath: string
): Promise<{ ok: true; content: string } | { ok: false; message: string; status: number }> {
  return readGitHubTextFile(repoInput, filePath, {
    allow: isFirewallSourcePath,
    invalidMessage: "filePath must be a TypeScript or JavaScript source file inside the repository.",
  });
}

export async function readGitHubTextFile(
  repoInput: string,
  filePath: string,
  options?: { allow?: (filePath: string) => boolean; invalidMessage?: string }
): Promise<{ ok: true; content: string } | { ok: false; message: string; status: number }> {
  const parsed = parseGitHubRepository(repoInput);
  if (!parsed) {
    return { ok: false, status: 400, message: "repoUrl must be a public GitHub URL or owner/repo." };
  }

  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const allow = options?.allow ?? isRepositoryTextPath;
  if (!allow(normalized)) {
    return {
      ok: false,
      status: 400,
      message: options?.invalidMessage ?? "filePath must be a text file inside the repository.",
    };
  }

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN || undefined,
    userAgent: "provix-architecture-firewall",
  });

  try {
    const response = await octokit.rest.repos.getContent({
      owner: parsed.owner,
      repo: parsed.repo,
      path: normalized,
    });
    if (Array.isArray(response.data) || response.data.type !== "file" || typeof response.data.content !== "string") {
      return { ok: false, status: 404, message: "File not found in that GitHub repository." };
    }
    const encoding = response.data.encoding === "base64" ? "base64" : "utf8";
    const content =
      encoding === "base64"
        ? Buffer.from(response.data.content.replace(/\s/g, ""), "base64").toString("utf8")
        : response.data.content;
    if (content.includes("\u0000")) {
      return { ok: false, status: 415, message: "That file is not readable text." };
    }
    return { ok: true, content };
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error && typeof error.status === "number"
        ? error.status
        : null;
    if (status === 401) {
      return { ok: false, status: 401, message: "GITHUB_TOKEN was rejected while reading the repository." };
    }
    if (status === 404) {
      return { ok: false, status: 404, message: "File not found in that GitHub repository." };
    }
    if (status === 403 || status === 429) {
      return {
        ok: false,
        status: 429,
        message: "GitHub rate limit reached. Set GITHUB_TOKEN to raise the limit.",
      };
    }
    return { ok: false, status: 502, message: "Could not read the file from GitHub." };
  }
}
