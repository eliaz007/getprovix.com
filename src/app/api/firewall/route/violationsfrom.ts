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
import { categoryFrom } from "./categoryfrom";
import { remediationFrom } from "./remediationfrom";

export function violationsFrom(value: unknown): FirewallViolation[] {
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
