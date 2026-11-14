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

export function pvimRemediationFrom(value: unknown): FirewallPvimRemediationStatus | undefined {
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
