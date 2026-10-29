import path from "node:path";
import { Octokit } from "@octokit/rest";
import { analyzeSourceTexts } from "../../scripts/ingest-engine";
import type { FirewallReport, FirewallResponse } from "@/lib/firewall-contract";
import { parseGitHubRepository } from "@/lib/github-repo-ref";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const IGNORED_SEGMENTS = new Set(["node_modules", ".next", "dist", "build"]);
const FILE_CAP = 50;
const MAX_FILE_BYTES = 1_500_000;
const FETCH_CONCURRENCY = 6;

type ScanResult = {
  status: number;
  body: FirewallResponse;
};

function errorBody(repoUrl: string | null, message: string, status: "error" | "empty" = "error"): FirewallResponse {
  return {
    ok: status !== "error",
    source: "github",
    status,
    message,
    target: repoUrl ? { kind: "github", repoUrl } : null,
    report: null,
  };
}

function statusOf(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
}

function messageFor(error: unknown): string {
  const status = statusOf(error);
  if (status === 404) return "That GitHub repository is not public or does not exist.";
  if (status === 403 || status === 429) {
    return "GitHub rate limit reached. Set GITHUB_TOKEN to raise the limit.";
  }
  return "The GitHub repository could not be scanned.";
}

function isRelevantSource(filePath: string): boolean {
  const parts = filePath.split("/");
  if (parts.some((part) => IGNORED_SEGMENTS.has(part) || part === "..")) return false;
  const extension = path.posix.extname(filePath);
  return SOURCE_EXTENSIONS.has(extension);
}

function toFirewallReport(report: ReturnType<typeof analyzeSourceTexts>): FirewallReport {
  const largestFiles = [...report.files]
    .sort((left, right) => right.lineCount - left.lineCount || left.filePath.localeCompare(right.filePath))
    .slice(0, 5)
    .map((file) => ({ filePath: file.filePath, lineCount: file.lineCount }));

  return {
    timestamp: report.timestamp,
    architectureScore: report.architectureScore,
    summary: report.summary,
    violations: report.violations,
    largestFiles,
  };
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await worker(item);
    }
  }

  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => run()));
  return results;
}

function decodeBlob(content: string, encoding: string): string | null {
  if (encoding !== "base64") return content.includes("\u0000") ? null : content;
  const text = Buffer.from(content.replace(/\s/g, ""), "base64").toString("utf8");
  return text.includes("\u0000") ? null : text;
}

export async function scanPublicGitHubRepo(input: string): Promise<ScanResult> {
  const parsed = parseGitHubRepository(input);
  if (!parsed) {
    return { status: 400, body: errorBody(null, "Paste a public GitHub URL or owner/repo.") };
  }

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN || undefined,
    userAgent: "provix-architecture-firewall",
  });

  try {
    const repository = await octokit.rest.repos.get({ owner: parsed.owner, repo: parsed.repo });
    const branch = repository.data.default_branch;
    const ref = await octokit.rest.git.getRef({
      owner: parsed.owner,
      repo: parsed.repo,
      ref: `heads/${branch}`,
    });
    const tree = await octokit.rest.git.getTree({
      owner: parsed.owner,
      repo: parsed.repo,
      tree_sha: ref.data.object.sha,
      recursive: "true",
    });

    const candidates = (tree.data.tree ?? [])
      .filter((item): item is typeof item & { path: string; sha: string } => {
        return item.type === "blob" && typeof item.path === "string" && typeof item.sha === "string" && isRelevantSource(item.path);
      })
      .map((item) => ({ path: item.path, sha: item.sha, size: item.size ?? 0 }))
      .filter((item) => item.size <= MAX_FILE_BYTES)
      .sort((left, right) => right.size - left.size || left.path.localeCompare(right.path));

    if (candidates.length === 0) {
      return {
        status: 200,
        body: errorBody(parsed.repoUrl, "No TypeScript or JavaScript source files were found in that repository.", "empty"),
      };
    }

    const selected = candidates.slice(0, FILE_CAP);
    const scannedAll = candidates.length <= FILE_CAP && !tree.data.truncated;
    const sources = (
      await mapPool(selected, FETCH_CONCURRENCY, async (file) => {
        const blob = await octokit.rest.git.getBlob({
          owner: parsed.owner,
          repo: parsed.repo,
          file_sha: file.sha,
        });
        const content = decodeBlob(blob.data.content, blob.data.encoding);
        return content === null ? null : { filePath: file.path, content };
      })
    ).filter((file): file is { filePath: string; content: string } => file !== null);

    if (sources.length === 0) {
      return { status: 502, body: errorBody(parsed.repoUrl, "GitHub returned no readable source files.") };
    }

    const report = toFirewallReport(analyzeSourceTexts(sources, { includeOrphans: scannedAll }));
    const coverage = scannedAll
      ? `all ${sources.length} source files`
      : `the ${sources.length} largest source files`;
    const truncated = tree.data.truncated ? " GitHub truncated the file tree." : "";

    return {
      status: 200,
      body: {
        ok: true,
        source: "github",
        status: "ready",
        message: `Scanned ${parsed.repoUrl}. Architecture firewall reviewed ${coverage}.${truncated}`,
        target: { kind: "github", repoUrl: parsed.repoUrl },
        report,
      },
    };
  } catch (error) {
    const status = statusOf(error);
    return {
      status: status === 404 ? 404 : status === 403 || status === 429 ? 429 : 502,
      body: errorBody(parsed.repoUrl, messageFor(error)),
    };
  }
}
