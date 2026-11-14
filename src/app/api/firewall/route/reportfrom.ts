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
import { summaryFrom } from "./summaryfrom";
import { violationsFrom } from "./violationsfrom";
import { largestFilesFrom } from "./largestfilesfrom";
import { pvimFindingsFrom } from "./pvimfindingsfrom";
import { pvimAnalysisFrom } from "./pvimanalysisfrom";
import { pvimReasoningFrom } from "./pvimreasoningfrom";

export function reportFrom(value: unknown): FirewallReport | null {
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
