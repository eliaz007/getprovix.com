import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  FIREWALL_CATEGORIES,
  isFirewallSeverity,
  type FirewallCategory,
  type FirewallLargestFile,
  type FirewallRemediation,
  type FirewallReport,
  type FirewallResponse,
  type FirewallScanRequest,
  type FirewallSummary,
  type FirewallViolation,
} from "@/lib/firewall-contract";
import { scanPublicGitHubRepo } from "@/lib/github-firewall-scan";

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

function reportFrom(value: unknown): FirewallReport | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const architectureScore = numberField(record.architectureScore);
  const summary = summaryFrom(record.summary);
  if (typeof record.timestamp !== "string" || architectureScore === null || !summary) return null;
  return {
    timestamp: record.timestamp,
    architectureScore: Math.round(architectureScore),
    summary,
    violations: violationsFrom(record.violations),
    largestFiles: largestFilesFrom(record.files),
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

  const scanned = await scanPublicGitHubRepo(repoUrl);
  return json(scanned.body, scanned.status);
}
