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

export function stringListField(value: unknown, maxItems: number, maxLen: number): string[] | undefined {
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
