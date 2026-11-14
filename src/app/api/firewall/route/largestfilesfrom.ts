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

export function largestFilesFrom(value: unknown): FirewallLargestFile[] {
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
