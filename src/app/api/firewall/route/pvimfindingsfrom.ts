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
import { pvimRemediationFrom } from "./pvimremediationfrom";

export function pvimFindingsFrom(value: unknown): FirewallPvimFinding[] {
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
