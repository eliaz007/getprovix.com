import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  FIREWALL_CATEGORIES,
  FIREWALL_PVIM_ANALYSIS_STATUSES,
  FIREWALL_PVIM_REASONING_STATUSES,
  isFirewallSeverity,
  type FirewallCategory,
  type FirewallLargestFile,
  type FirewallPvimAnalysis,
  type FirewallPvimFinding,
  type FirewallPvimReasoning,
  type FirewallPvimRemediationCode,
  type FirewallPvimRemediationStatus,
  type FirewallRemediation,
  type FirewallReport,
  type FirewallResponse,
  type FirewallScanRequest,
  type FirewallSummary,
  type FirewallViolation,
} from "@/lib/firewall-contract";
import { requireApiUser } from "@/lib/api-auth";
import { authorizeFirewallRepoAccess, readProvidedGithubToken } from "@/lib/firewall-repo-access";
import { scanPublicGitHubRepo } from "@/lib/github-firewall-scan";
import { parseGitHubRepository } from "@/lib/github-repo-ref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REPORT_PATH = path.join(process.cwd(), "scripts", "audit-report.json");
const LOCAL_TARGET = {
  kind: "local" as const,
  snapshot: "scripts/audit-report.json" as const,
};

function json(body: FirewallResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function summaryFrom(value: unknown): FirewallSummary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const totalFiles = numberField(record.totalFiles);
  const totalLines = numberField(record.totalLines);
  const criticalCount = numberField(record.criticalCount);
  const highCount = numberField(record.highCount);
  const mediumCount = numberField(record.mediumCount);
  const lowCount = numberField(record.lowCount);
  if (
    totalFiles === null ||
    totalLines === null ||
    criticalCount === null ||
    highCount === null ||
    mediumCount === null ||
    lowCount === null
  ) {
    return null;
  }
  return { totalFiles, totalLines, criticalCount, highCount, mediumCount, lowCount };
}

function categoryFrom(value: unknown): FirewallCategory | undefined {
  return typeof value === "string" && (FIREWALL_CATEGORIES as readonly string[]).includes(value)
    ? (value as FirewallCategory)
    : undefined;
}

function remediationFrom(value: unknown): FirewallRemediation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.diff !== "string") return undefined;
  return {
    diff: record.diff,
    ...(typeof record.command === "string" ? { command: record.command } : {}),
    ...(typeof record.envExample === "string" ? { envExample: record.envExample } : {}),
  };
}

function violationsFrom(value: unknown): FirewallViolation[] {
  if (!Array.isArray(value)) return [];
  const violations: FirewallViolation[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const line = numberField(record.line);
    if (
      typeof record.filePath !== "string" ||
      typeof record.severity !== "string" ||
      !isFirewallSeverity(record.severity) ||
      typeof record.rule !== "string" ||
      typeof record.message !== "string" ||
      line === null
    ) {
      continue;
    }
    const category = categoryFrom(record.category);
    const remediation = remediationFrom(record.remediation);
    violations.push({
      filePath: record.filePath,
      severity: record.severity,
      rule: record.rule,
      message: record.message,
      line,
      ...(category ? { category } : {}),
      ...(typeof record.snippet === "string" ? { snippet: record.snippet } : {}),
      ...(remediation ? { remediation } : {}),
      ...(typeof record.autofixable === "boolean" ? { autofixable: record.autofixable } : {}),
    });
  }
  return violations;
}

function largestFilesFrom(value: unknown): FirewallLargestFile[] {
  if (!Array.isArray(value)) return [];
  const files: FirewallLargestFile[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const lineCount = numberField(record.lineCount);
    if (typeof record.filePath !== "string" || lineCount === null) continue;
    files.push({ filePath: record.filePath, lineCount });
  }
  return files
    .sort((left, right) => right.lineCount - left.lineCount || left.filePath.localeCompare(right.filePath))
    .slice(0, 5);
}

function pvimRemediationFrom(value: unknown): FirewallPvimRemediationStatus | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.kind === "pending") return { kind: "pending" };
  if (
    record.kind === "supported" &&
    (record.category === "SECRET_LEAK" || record.category === "CLIENT_DB_EXPOSURE") &&
    record.requiresScannerAgreement === true
  ) {
    return {
      kind: "supported",
      category: record.category,
      requiresScannerAgreement: true,
    };
  }
  if (
    record.kind === "unsupported" &&
    typeof record.code === "string" &&
    typeof record.reason === "string"
  ) {
    return {
      kind: "unsupported",
      code: record.code as FirewallPvimRemediationCode,
      reason: record.reason,
    };
  }
  return undefined;
}

function pvimFindingsFrom(value: unknown): FirewallPvimFinding[] {
  if (!Array.isArray(value)) return [];
  const findings: FirewallPvimFinding[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.source !== "pvim") continue;
    if (typeof record.findingId !== "string" || !record.findingId.trim()) continue;
    if (typeof record.label !== "string" || !record.label.trim()) continue;
    if (typeof record.ruleId !== "string") continue;
    if (typeof record.confidence !== "string" || !record.confidence.trim()) continue;
    const line = numberField(record.line);
    const remediation = pvimRemediationFrom(record.remediation);
    const engineSource =
      record.engineSource === "m1" || record.engineSource === "m2" ? record.engineSource : undefined;
    findings.push({
      findingId: record.findingId.trim(),
      source: "pvim",
      ...(engineSource ? { engineSource } : {}),
      label: record.label.trim(),
      ruleId: record.ruleId,
      confidence: record.confidence.trim(),
      family: typeof record.family === "string" ? record.family : record.family === null ? null : undefined,
      filePath: typeof record.filePath === "string" ? record.filePath : null,
      line: line !== null && line >= 1 ? line : null,
      ...(typeof record.message === "string" ? { message: record.message } : {}),
      ...(typeof record.snippet === "string" ? { snippet: record.snippet } : {}),
      ...(remediation ? { remediation } : {}),
    });
  }
  return findings;
}

function pvimAnalysisFrom(value: unknown): FirewallPvimAnalysis | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.status !== "string" ||
    !(FIREWALL_PVIM_ANALYSIS_STATUSES as readonly string[]).includes(record.status)
  ) {
    return undefined;
  }
  const findingCount = numberField(record.findingCount);
  const incomplete = numberField(record.incomplete);
  const elapsedMs = numberField(record.elapsedMs);
  if (findingCount === null || incomplete === null || elapsedMs === null) return undefined;
  return {
    status: record.status as FirewallPvimAnalysis["status"],
    findingCount,
    incomplete,
    elapsedMs,
    ...(typeof record.engineVersion === "string" ? { engineVersion: record.engineVersion } : {}),
    ...(typeof record.jobId === "string" ? { jobId: record.jobId } : {}),
    ...(typeof record.message === "string" ? { message: record.message } : {}),
  };
}

function stringListField(value: unknown, maxItems: number, maxLen: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    if (out.length >= maxItems) break;
    if (typeof item !== "string") continue;
    const trimmed = item.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    out.push(trimmed.length <= maxLen ? trimmed : `${trimmed.slice(0, maxLen - 1).trimEnd()}…`);
  }
  return out.length > 0 ? out : undefined;
}

function pvimReasoningFrom(value: unknown): FirewallPvimReasoning | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.status !== "string" ||
    !(FIREWALL_PVIM_REASONING_STATUSES as readonly string[]).includes(record.status)
  ) {
    return undefined;
  }
  if (typeof record.detail !== "string") return undefined;
  if (typeof record.hasCriticalReliabilityFlags !== "boolean") return undefined;
  const flags = stringListField(record.criticalReliabilityFlags, 32, 200) ?? [];
  const openQuestions = stringListField(record.openQuestions, 8, 200);
  const answerBlurbs = stringListField(record.answerBlurbs, 8, 240);
  const notes =
    typeof record.notes === "string" && record.notes.trim()
      ? record.notes.replace(/\s+/g, " ").trim().slice(0, 500)
      : record.notes === null
        ? null
        : undefined;

  return {
    status: record.status as FirewallPvimReasoning["status"],
    detail: record.detail,
    hasCriticalReliabilityFlags: record.hasCriticalReliabilityFlags,
    criticalReliabilityFlags: flags,
    ...(typeof record.provider === "string" || record.provider === null
      ? { provider: record.provider }
      : {}),
    ...(typeof record.caseId === "string" || record.caseId === null ? { caseId: record.caseId } : {}),
    ...(typeof record.caseSelection === "string" || record.caseSelection === null
      ? { caseSelection: record.caseSelection }
      : {}),
    ...(typeof record.stopReason === "string" || record.stopReason === null
      ? { stopReason: record.stopReason }
      : {}),
    ...(typeof record.error === "string" || record.error === null ? { error: record.error } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(openQuestions ? { openQuestions } : {}),
    ...(answerBlurbs ? { answerBlurbs } : {}),
  };
}

function reportFrom(value: unknown): FirewallReport | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const architectureScore = numberField(record.architectureScore);
  const summary = summaryFrom(record.summary);
  if (typeof record.timestamp !== "string" || architectureScore === null || !summary) return null;
  const commitSha =
    typeof record.commitSha === "string" && record.commitSha.trim()
      ? record.commitSha.trim()
      : undefined;
  const pvim = pvimAnalysisFrom(record.pvim);
  const pvimFindings = pvimFindingsFrom(record.pvimFindings);
  const pvimReasoning = pvimReasoningFrom(record.pvimReasoning);
  return {
    timestamp: record.timestamp,
    architectureScore: Math.round(architectureScore),
    summary,
    violations: violationsFrom(record.violations),
    largestFiles: largestFilesFrom(record.files),
    ...(commitSha ? { commitSha } : {}),
    ...(pvim ? { pvim } : {}),
    ...(pvimFindings.length > 0 ? { pvimFindings } : {}),
    ...(pvimReasoning ? { pvimReasoning } : {}),
  };
}

async function readLocalReport(): Promise<FirewallResponse> {
  try {
    const raw = await fs.readFile(REPORT_PATH, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return {
        ok: false,
        source: "local",
        status: "error",
        message: "The architecture report is not valid JSON.",
        target: LOCAL_TARGET,
        report: null,
      };
    }
    const report = reportFrom(parsed);
    if (!report) {
      return {
        ok: false,
        source: "local",
        status: "error",
        message: "The architecture report is not in the expected shape.",
        target: LOCAL_TARGET,
        report: null,
      };
    }
    return {
      ok: true,
      source: "local",
      status: "ready",
      message: null,
      target: LOCAL_TARGET,
      report,
    };
  } catch (error) {
    const missing = typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
    if (missing) {
      return {
        ok: true,
        source: "local",
        status: "empty",
        message: "No architecture report yet. Run npx tsx scripts/ingest-engine.ts.",
        target: LOCAL_TARGET,
        report: null,
      };
    }
    return {
      ok: false,
      source: "local",
      status: "error",
      message: "Could not read the architecture report.",
      target: LOCAL_TARGET,
      report: null,
    };
  }
}

function repoUrlFrom(body: FirewallScanRequest): string | null {
  const raw = typeof body.repoUrl === "string" ? body.repoUrl : body.githubUrl;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 500) return null;
  return trimmed;
}

export async function GET() {
  const report = await readLocalReport();
  return json(report, report.status === "error" ? 500 : 200);
}

export async function POST(request: Request) {
  let body: FirewallScanRequest;
  try {
    body = (await request.json()) as FirewallScanRequest;
  } catch {
    return json(
      {
        ok: false,
        source: "local",
        status: "error",
        message: "Request body must be JSON.",
        target: null,
        report: null,
      },
      400
    );
  }

  const repoUrl = repoUrlFrom(body);
  const wantsGithub = body.source === "github" || repoUrl !== null;
  if (!wantsGithub) {
    const report = await readLocalReport();
    return json(report, report.status === "error" ? 500 : 200);
  }

  if (!repoUrl) {
    return json(
      {
        ok: false,
        source: "github",
        status: "error",
        message: "A GitHub scan needs repoUrl or githubUrl.",
        target: null,
        report: null,
      },
      400
    );
  }

  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return json(
      {
        ok: false,
        source: "github",
        status: "error",
        message: "Sign in to scan a repository.",
        target: null,
        report: null,
      },
      401
    );
  }

  const parsed = parseGitHubRepository(repoUrl);
  if (!parsed) {
    return json(
      {
        ok: false,
        source: "github",
        status: "error",
        message: "Paste a public GitHub URL or owner/repo.",
        target: null,
        report: null,
      },
      400
    );
  }

  const granted = await authorizeFirewallRepoAccess({
    supabase: session.supabase,
    userId: session.user.id,
    owner: parsed.owner,
    repo: parsed.repo,
    githubToken: readProvidedGithubToken(body.githubToken),
    purpose: "scan",
  });
  if (!granted.ok) {
    return json(
      {
        ok: false,
        source: "github",
        status: "error",
        message: granted.message,
        target: { kind: "github", repoUrl: parsed.repoUrl },
        report: null,
      },
      granted.status
    );
  }

  const scanned = await scanPublicGitHubRepo(repoUrl, granted.token);
  return json(scanned.body, scanned.status);
}
