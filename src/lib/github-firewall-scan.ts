import path from "node:path";
import { Octokit } from "@octokit/rest";
import { analyzeSourceTexts } from "../../scripts/ingest-engine";
import type {
  FirewallPvimAnalysis,
  FirewallPvimFinding,
  FirewallPvimReasoning,
  FirewallReport,
  FirewallResponse,
} from "@/lib/firewall-contract";
import { applyHonestFixGate } from "@/lib/honest-fix-gate";
import { parseGitHubRepository } from "@/lib/github-repo-ref";
import {
  isNonProductionSourcePath,
  isSqlMigrationCompanionPath,
  runPvimShadowForScan,
  type PvimShadowScanDeps,
} from "@/lib/pvim/pvim-shadow-scan";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const IGNORED_SEGMENTS = new Set(["node_modules", ".next", "dist", "build"]);
const LOCKFILES = new Set(["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml"]);
const FILE_CAP = 50;
const COMPANION_CAP = 40;
const MAX_FILE_BYTES = 1_500_000;
const MAX_COMPANION_BYTES = 200_000;
const FETCH_CONCURRENCY = 6;

/** Exported for focused selection tests. */
export const GITHUB_FIREWALL_FILE_CAP = FILE_CAP;
export const GITHUB_FIREWALL_COMPANION_CAP = COMPANION_CAP;

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
  if (status === 404) {
    return "GitHub could not find that repository with the Provix App install. Confirm the app is installed on this repo.";
  }
  if (status === 403 || status === 429) {
    return "GitHub rate limit reached. Wait and try again.";
  }
  return "The GitHub repository could not be scanned.";
}

function isIgnored(filePath: string): boolean {
  const parts = filePath.split("/");
  return parts.some((part) => IGNORED_SEGMENTS.has(part) || part === "..");
}

function isRelevantSource(filePath: string): boolean {
  if (isIgnored(filePath)) return false;
  return SOURCE_EXTENSIONS.has(path.posix.extname(filePath));
}

function companionRank(filePath: string): number {
  const name = filePath.split("/").pop() ?? filePath;
  if (name === "package.json") return 0;
  // Prefer SQL migrations so PVIM P3 can establish RLS context.
  if (isSqlMigrationCompanionPath(filePath)) return 1;
  if (name === ".env" || name.startsWith(".env.")) return 2;
  if (/(?:secret|credential|service-role|apikey|api-key)/i.test(filePath)) return 3;
  return 4;
}

function isSecurityCompanion(filePath: string): boolean {
  if (isIgnored(filePath)) return false;
  const name = filePath.split("/").pop() ?? filePath;
  if (LOCKFILES.has(name)) return false;
  if (name === "package.json" || name === ".env" || name.startsWith(".env.")) return true;
  if (isSqlMigrationCompanionPath(filePath)) return true;
  if (name.endsWith(".json")) return true;
  if (SOURCE_EXTENSIONS.has(path.posix.extname(filePath)) && companionRank(filePath) === 3) return true;
  return false;
}

type SizedBlob = { path: string; sha: string; size: number };

/**
 * Production-first FILE_CAP selection: fill with production sources (largest first),
 * then non-production (tests/fixtures/…) with remaining slots so secrets in tests
 * can still be fetched without displacing application code.
 */
export function selectGitHubSourceBlobsForScan(
  candidates: readonly SizedBlob[],
  fileCap: number = FILE_CAP
): SizedBlob[] {
  const production = candidates
    .filter((item) => !isNonProductionSourcePath(item.path))
    .sort((left, right) => right.size - left.size || left.path.localeCompare(right.path));
  const nonProduction = candidates
    .filter((item) => isNonProductionSourcePath(item.path))
    .sort((left, right) => right.size - left.size || left.path.localeCompare(right.path));
  return [...production, ...nonProduction].slice(0, fileCap);
}

export type FirewallScanProvenance = {
  /** Exact commit SHA whose tree was scanned (`git.getRef` → `object.sha`). */
  commitSha?: string | null;
  /** Optional PVIM summary. Omit / null when PVIM was not invoked. */
  pvim?: FirewallPvimAnalysis | null;
  /** Optional PVIM findings. Never merged into Provix `violations`. */
  pvimFindings?: readonly FirewallPvimFinding[] | null;
  /** Optional non-authoritative PVIM reasoning. Omit when absent. */
  pvimReasoning?: FirewallPvimReasoning | null;
};

/**
 * Build a FirewallReport from Provix `analyzeSourceTexts` output.
 * Provenance fields are additive and omitted when absent so local snapshots stay valid.
 */
export function toFirewallReport(
  report: ReturnType<typeof analyzeSourceTexts>,
  provenance?: FirewallScanProvenance
): FirewallReport {
  const largestFiles = [...report.files]
    .sort((left, right) => right.lineCount - left.lineCount || left.filePath.localeCompare(right.filePath))
    .slice(0, 5)
    .map((file) => ({ filePath: file.filePath, lineCount: file.lineCount }));

  const commitSha =
    typeof provenance?.commitSha === "string" && provenance.commitSha.trim()
      ? provenance.commitSha.trim()
      : undefined;

  return {
    timestamp: report.timestamp,
    architectureScore: report.architectureScore,
    summary: report.summary,
    violations: report.violations,
    largestFiles,
    ...(commitSha ? { commitSha } : {}),
    ...(provenance?.pvim ? { pvim: provenance.pvim } : {}),
    ...(provenance?.pvimFindings && provenance.pvimFindings.length > 0
      ? { pvimFindings: [...provenance.pvimFindings] }
      : {}),
    ...(provenance?.pvimReasoning ? { pvimReasoning: provenance.pvimReasoning } : {}),
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

export type ScanPublicGitHubRepoOptions = {
  /** Optional PVIM shadow scan overrides (tests / isolation). */
  pvim?: PvimShadowScanDeps;
};

export async function scanPublicGitHubRepo(
  input: string,
  token: string,
  options: ScanPublicGitHubRepoOptions = {}
): Promise<ScanResult> {
  const parsed = parseGitHubRepository(input);
  if (!parsed) {
    return { status: 400, body: errorBody(null, "Paste a public GitHub URL or owner/repo.") };
  }

  const octokit = new Octokit({
    auth: token,
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
    // Exact audited tip — same SHA used for the recursive tree and blob reads below.
    const commitSha = ref.data.object.sha;
    const tree = await octokit.rest.git.getTree({
      owner: parsed.owner,
      repo: parsed.repo,
      tree_sha: commitSha,
      recursive: "true",
    });

    const blobs = (tree.data.tree ?? []).filter(
      (item): item is typeof item & { path: string; sha: string } =>
        item.type === "blob" && typeof item.path === "string" && typeof item.sha === "string"
    );
    const candidates = blobs
      .filter((item) => isRelevantSource(item.path))
      .map((item) => ({ path: item.path, sha: item.sha, size: item.size ?? 0 }))
      .filter((item) => item.size <= MAX_FILE_BYTES);
    const selected = selectGitHubSourceBlobsForScan(candidates, FILE_CAP);
    const selectedPaths = new Set(selected.map((item) => item.path));
    const companions = blobs
      .filter((item) => isSecurityCompanion(item.path) && !selectedPaths.has(item.path))
      .map((item) => ({ path: item.path, sha: item.sha, size: item.size ?? 0 }))
      .filter((item) => item.size <= MAX_COMPANION_BYTES)
      .sort(
        (left, right) =>
          companionRank(left.path) - companionRank(right.path) || left.path.localeCompare(right.path)
      )
      .slice(0, COMPANION_CAP);

    if (selected.length === 0 && companions.length === 0) {
      return {
        status: 200,
        body: errorBody(parsed.repoUrl, "No TypeScript or JavaScript source files were found in that repository.", "empty"),
      };
    }

    const scannedAll = candidates.length <= FILE_CAP && !tree.data.truncated;
    const owner = parsed.owner;
    const repo = parsed.repo;
    async function readBlob(file: { path: string; sha: string }) {
      const blob = await octokit.rest.git.getBlob({
        owner,
        repo,
        file_sha: file.sha,
      });
      const content = decodeBlob(blob.data.content, blob.data.encoding);
      return content === null ? null : { filePath: file.path, content };
    }
    const sources = (await mapPool(selected, FETCH_CONCURRENCY, readBlob)).filter(
      (file): file is { filePath: string; content: string } => file !== null
    );
    const companionSources = (await mapPool(companions, FETCH_CONCURRENCY, readBlob)).filter(
      (file): file is { filePath: string; content: string } => file !== null
    );

    if (sources.length === 0 && companionSources.length === 0) {
      return { status: 502, body: errorBody(parsed.repoUrl, "GitHub returned no readable source files.") };
    }

    const audited = analyzeSourceTexts(sources, {
      includeOrphans: scannedAll && sources.length > 0,
      companionFiles: companionSources,
    });
    const violations = await applyHonestFixGate(audited.violations, [
      ...sources,
      ...companionSources,
    ]);

    // PVIM is additive shadow analysis on the same commitSha + already-fetched texts.
    // Failures never alter Provix detections, score, or runner inputs.
    let pvimProvenance: FirewallScanProvenance = { commitSha };
    try {
      const shadow = await runPvimShadowForScan(
        {
          owner,
          repo,
          defaultBranch: branch,
          commitSha,
          sources,
          companions: companionSources,
        },
        options.pvim
      );
      if (shadow) {
        pvimProvenance = {
          commitSha,
          pvim: shadow.pvim,
          ...(shadow.pvimFindings ? { pvimFindings: shadow.pvimFindings } : {}),
          ...(shadow.pvimReasoning ? { pvimReasoning: shadow.pvimReasoning } : {}),
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unexpected PVIM integration failure";
      pvimProvenance = {
        commitSha,
        pvim: {
          status: "error",
          findingCount: 0,
          incomplete: 0,
          elapsedMs: 0,
          message: `PVIM shadow integration failed: ${message}`,
        },
      };
    }

    const report = toFirewallReport({ ...audited, violations }, pvimProvenance);
    const coverage = scannedAll
      ? `all ${sources.length} source files`
      : `the ${sources.length} largest source files`;
    const companionNote = companionSources.length > 0 ? ` and ${companionSources.length} config files` : "";
    const truncated = tree.data.truncated ? " GitHub truncated the file tree." : "";

    return {
      status: 200,
      body: {
        ok: true,
        source: "github",
        status: "ready",
        message: `Scanned ${parsed.repoUrl}. Architecture firewall and security guard reviewed ${coverage}${companionNote}.${truncated}`,
        target: { kind: "github", repoUrl: parsed.repoUrl },
        report,
        coverage: {
          scanned: sources.length,
          total: candidates.length,
          treeTruncated: Boolean(tree.data.truncated),
        },
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
