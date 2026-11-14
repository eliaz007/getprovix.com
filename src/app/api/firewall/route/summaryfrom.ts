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

export function summaryFrom(value: unknown): FirewallSummary | null {
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
