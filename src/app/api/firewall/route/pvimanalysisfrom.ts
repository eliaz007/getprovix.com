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
import { numberField } from "./numberfield";

export function pvimAnalysisFrom(value: unknown): FirewallPvimAnalysis | undefined {
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
