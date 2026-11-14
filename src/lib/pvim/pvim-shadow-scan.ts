/**
 * Scan-pipeline helpers for PVIM shadow analysis.
 * Builds a bounded M4.1 payload from already-fetched GitHub sources — no second fetch.
 */

import type {
  FirewallPvimAnalysis,
  FirewallPvimFinding,
  FirewallPvimReasoning,
} from "@/lib/firewall-contract";
import { applyPvimHonestFixGate } from "@/lib/pvim/pvim-honest-fix-gate";
import {
  PVIM_SHADOW_LIMITS,
  analyzeWithPvimShadow,
  canonicalizePvimRepoPath,
  toFirewallPvimAnalysis,
  toFirewallPvimFindings,
  toFirewallPvimReasoning,
  type PvimShadowClientDeps,
  type PvimShadowClientResult,
  type PvimShadowFileInput,
  type PvimShadowRequestInput,
} from "@/lib/pvim/pvim-shadow-client";

export type ScannedTextFile = {
  filePath: string;
  content: string;
};

export type PvimFileExclusion = {
  path: string;
  reason: string;
  code:
    | "invalid_path"
    | "prohibited_path"
    | "empty_content"
    | "file_too_large"
    | "max_files"
    | "total_too_large"
    | "duplicate_path";
};

export type PvimShadowScanSelection = {
  files: PvimShadowFileInput[];
  exclusions: PvimFileExclusion[];
  totalBytes: number;
};

export type PvimShadowScanContext = {
  owner: string;
  repo: string;
  defaultBranch: string;
  commitSha: string;
  sources: readonly ScannedTextFile[];
  companions: readonly ScannedTextFile[];
  jobId?: string;
};

export type PvimShadowScanDeps = {
  enabled?: boolean;
  analyze?: typeof analyzeWithPvimShadow;
  clientDeps?: PvimShadowClientDeps;
};

export type PvimShadowScanProvenance = {
  pvim: FirewallPvimAnalysis;
  pvimFindings?: FirewallPvimFinding[];
  /** Optional non-authoritative reasoning; omit when PVIM did not attach it. */
  pvimReasoning?: FirewallPvimReasoning;
};

/** Server-only opt-in. Never read via `NEXT_PUBLIC_*`. */
export function isPvimShadowEnabled(override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  return process.env.PVIM_SHADOW_ENABLED?.trim().toLowerCase() === "true";
}

const PROHIBITED_BASENAMES = new Set(
  [
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".env.test",
    ".env.staging",
    "credentials.json",
    "credentials.yml",
    "credentials.yaml",
    "secrets.json",
    "secrets.yml",
    "secrets.yaml",
    "service-account.json",
    "serviceaccount.json",
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    ".netrc",
    ".npmrc",
    ".pypirc",
    "token",
    "password",
    "secret",
    "passwd",
  ].map((s) => s.toLowerCase())
);

const PROHIBITED_SUFFIXES = [".pem", ".p12", ".pfx", ".key", ".keystore", ".jks"] as const;

/** Path segments that mark non-production analysis surfaces (tests, fixtures, mocks, …). */
const NON_PRODUCTION_DIR_SEGMENTS = new Set([
  "__tests__",
  "__mocks__",
  "__fixtures__",
  "__generated__",
  "tests",
  "test",
  "fixtures",
  "testdata",
  "test-data",
  "mocks",
  "mock",
  "examples",
  "example",
  "samples",
  "sample",
  "generated",
  "stories",
  "storybook",
]);

/**
 * True for test / fixture / mock / generated / example paths.
 * Used for selection priority only — never a blanket secret-scan skip.
 */
export function isNonProductionSourcePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return false;
  const base = normalized.split("/").pop() ?? normalized;
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(base)) return true;
  if (/\.(?:test|spec)\.py$/i.test(base)) return true;
  if (/\.stories\.[cm]?[jt]sx?$/i.test(base)) return true;
  if (/\.mock\.[cm]?[jt]sx?$/i.test(base)) return true;
  if (/\.generated\.[cm]?[jt]sx?$/i.test(base)) return true;
  if (/\.example\.[cm]?[jt]sx?$/i.test(base)) return true;
  if (/\.sample\.[cm]?[jt]sx?$/i.test(base)) return true;
  return normalized
    .split("/")
    .some((part) => NON_PRODUCTION_DIR_SEGMENTS.has(part.toLowerCase()));
}

/** Supabase / generic SQL migration paths eligible as PVIM context companions. */
export function isSqlMigrationCompanionPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
  if (!normalized.endsWith(".sql")) return false;
  if (normalized.includes("/migrations/") || normalized.startsWith("migrations/")) return true;
  if (normalized.includes("/supabase/") && normalized.endsWith(".sql")) return true;
  return false;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isProhibitedBasename(basename: string): string | null {
  const lower = basename.toLowerCase();
  if (PROHIBITED_BASENAMES.has(lower)) {
    return `prohibited secret-bearing filename: ${basename}`;
  }
  if (/^\.env(\.|$)/i.test(basename)) {
    return `prohibited env file: ${basename}`;
  }
  if (PROHIBITED_SUFFIXES.some((suf) => lower.endsWith(suf))) {
    return `prohibited credential/key file: ${basename}`;
  }
  return null;
}

function languageForPath(filePath: string): string | undefined {
  const ext = filePath.includes(".") ? filePath.slice(filePath.lastIndexOf(".")).toLowerCase() : "";
  switch (ext) {
    case ".ts":
    case ".tsx":
      return "typescript";
    case ".js":
    case ".jsx":
      return "javascript";
    case ".py":
      return "python";
    case ".json":
      return "json";
    case ".sql":
      return "sql";
    default:
      return undefined;
  }
}

function summarizeExclusions(exclusions: readonly PvimFileExclusion[]): string {
  if (exclusions.length === 0) return "";
  const byCode = new Map<string, number>();
  for (const item of exclusions) {
    byCode.set(item.code, (byCode.get(item.code) ?? 0) + 1);
  }
  const parts = [...byCode.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, count]) => `${count} ${code}`);
  return `Excluded ${exclusions.length} local file(s) before PVIM send (${parts.join(", ")}).`;
}

/**
 * Deterministically select files that fit PVIM M4.1 limits.
 * Production paths are filled before test/fixture/mock/generated/example paths so
 * large synthetic suites cannot displace application sources. Non-production files
 * remain eligible afterward (within the same caps) so real secrets in tests can still
 * reach M1 secret detection. Never truncates content.
 */
export function selectPvimShadowFiles(
  scanned: readonly ScannedTextFile[]
): PvimShadowScanSelection {
  const exclusions: PvimFileExclusion[] = [];
  const candidates: Array<PvimShadowFileInput & { bytes: number; nonProduction: boolean }> = [];
  const seen = new Set<string>();

  // Stable pre-order: path ascending (final fill order re-ranks by production tier).
  const ordered = [...scanned].sort((a, b) => a.filePath.localeCompare(b.filePath));

  for (const file of ordered) {
    const canon = canonicalizePvimRepoPath(file.filePath);
    if (!canon.ok) {
      exclusions.push({ path: file.filePath, reason: canon.reason, code: "invalid_path" });
      continue;
    }

    const basename = canon.path.split("/").pop() ?? canon.path;
    const prohibited = isProhibitedBasename(basename);
    if (prohibited) {
      exclusions.push({ path: canon.path, reason: prohibited, code: "prohibited_path" });
      continue;
    }

    const caseKey = canon.path.toLowerCase();
    if (seen.has(caseKey)) {
      exclusions.push({ path: canon.path, reason: "duplicate path", code: "duplicate_path" });
      continue;
    }
    seen.add(caseKey);

    if (typeof file.content !== "string" || file.content === "") {
      exclusions.push({ path: canon.path, reason: "content must not be empty", code: "empty_content" });
      continue;
    }

    const bytes = utf8ByteLength(file.content);
    if (bytes > PVIM_SHADOW_LIMITS.maxFileBytes) {
      exclusions.push({
        path: canon.path,
        reason: `content size ${bytes} exceeds max_file_bytes=${PVIM_SHADOW_LIMITS.maxFileBytes}`,
        code: "file_too_large",
      });
      continue;
    }

    const language = languageForPath(canon.path);
    candidates.push({
      path: canon.path,
      content: file.content,
      ...(language ? { language } : {}),
      bytes,
      nonProduction: isNonProductionSourcePath(canon.path),
    });
  }

  // Production first, then non-production; path ascending within each tier.
  candidates.sort((left, right) => {
    if (left.nonProduction !== right.nonProduction) {
      return left.nonProduction ? 1 : -1;
    }
    return left.path.localeCompare(right.path);
  });

  const selected: PvimShadowFileInput[] = [];
  let totalBytes = 0;

  for (const candidate of candidates) {
    if (selected.length >= PVIM_SHADOW_LIMITS.maxFiles) {
      exclusions.push({
        path: candidate.path,
        reason: `exceeds max_files=${PVIM_SHADOW_LIMITS.maxFiles}`,
        code: "max_files",
      });
      continue;
    }
    if (totalBytes + candidate.bytes > PVIM_SHADOW_LIMITS.maxTotalBytes) {
      exclusions.push({
        path: candidate.path,
        reason: `would exceed max_total_bytes=${PVIM_SHADOW_LIMITS.maxTotalBytes}`,
        code: "total_too_large",
      });
      continue;
    }
    totalBytes += candidate.bytes;
    selected.push({
      path: candidate.path,
      content: candidate.content,
      ...(candidate.language ? { language: candidate.language } : {}),
    });
  }

  return { files: selected, exclusions, totalBytes };
}

function skippedAnalysis(
  message: string,
  exclusions: readonly PvimFileExclusion[]
): PvimShadowScanProvenance {
  return {
    pvim: {
      status: "incomplete",
      findingCount: 0,
      incomplete: exclusions.length,
      elapsedMs: 0,
      message,
    },
  };
}

function applyLocalIncompleteness(
  analysis: FirewallPvimAnalysis,
  exclusions: readonly PvimFileExclusion[]
): FirewallPvimAnalysis {
  if (exclusions.length === 0) return analysis;
  const note = summarizeExclusions(exclusions);
  const message = [analysis.message, note].filter(Boolean).join(" ");
  if (analysis.status === "ok" || analysis.status === "incomplete") {
    return {
      ...analysis,
      status: "incomplete",
      incomplete: analysis.incomplete + exclusions.length,
      message,
    };
  }
  return { ...analysis, message };
}

/**
 * Run one PVIM shadow request for an already-scanned GitHub commit.
 * Isolates all failures. Never throws.
 */
export async function runPvimShadowForScan(
  context: PvimShadowScanContext,
  deps: PvimShadowScanDeps = {}
): Promise<PvimShadowScanProvenance | null> {
  if (!isPvimShadowEnabled(deps.enabled)) {
    return null;
  }

  const mergedSources: ScannedTextFile[] = [];
  const seen = new Set<string>();
  for (const file of [...context.sources, ...context.companions]) {
    const key = file.filePath.replace(/\\/g, "/").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    mergedSources.push(file);
  }

  const selection = selectPvimShadowFiles(mergedSources);
  if (selection.files.length === 0) {
    return skippedAnalysis(
      selection.exclusions.length > 0
        ? `PVIM shadow skipped: no eligible files after local limits. ${summarizeExclusions(selection.exclusions)}`
        : "PVIM shadow skipped: no eligible source files were available.",
      selection.exclusions
    );
  }

  const jobId =
    context.jobId?.trim() ||
    `firewall-${context.owner}-${context.repo}-${context.commitSha.slice(0, 12)}`.slice(
      0,
      PVIM_SHADOW_LIMITS.maxJobIdLength
    );

  const input: PvimShadowRequestInput = {
    jobId,
    commitSha: context.commitSha,
    files: selection.files,
    options: { runM1: true, runM2: true },
    repository: {
      provider: "github",
      owner: context.owner,
      name: context.repo,
      defaultBranch: context.defaultBranch,
    },
  };

  const analyze = deps.analyze ?? analyzeWithPvimShadow;
  let result: PvimShadowClientResult;
  try {
    result = await analyze(input, deps.clientDeps);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected PVIM client failure";
    return {
      pvim: {
        status: "error",
        findingCount: 0,
        incomplete: selection.exclusions.length,
        elapsedMs: 0,
        message: `PVIM shadow client threw unexpectedly: ${message}. ${summarizeExclusions(selection.exclusions)}`.trim(),
        jobId,
      },
    };
  }

  const analysis = applyLocalIncompleteness(toFirewallPvimAnalysis(result), selection.exclusions);

  const contentByPath = new Map(
    selection.files.map((file) => [file.path.replace(/\\/g, "/").toLowerCase(), file.content] as const)
  );
  let findings = result.report
    ? toFirewallPvimFindings(result.report, {
        contentAtPath: (filePath) => {
          const key = filePath.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
          return contentByPath.get(key) ?? null;
        },
      })
    : undefined;

  // Scan-time honesty: only keep Fix-with-PR "supported" when Provix can plan +
  // pass the same heal/`tsc` gate the PR path uses (native autofixable parity).
  if (findings && findings.length > 0) {
    findings = await applyPvimHonestFixGate(findings, mergedSources);
  }

  const pvimReasoning = result.report
    ? toFirewallPvimReasoning(result.report.reasoning)
    : undefined;

  return {
    pvim: {
      ...analysis,
      jobId: analysis.jobId ?? jobId,
    },
    ...(findings && findings.length > 0 ? { pvimFindings: findings } : {}),
    ...(pvimReasoning ? { pvimReasoning } : {}),
  };
}
