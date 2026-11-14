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
import { stringListField } from "./stringlistfield";

export function pvimReasoningFrom(value: unknown): FirewallPvimReasoning | undefined {
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
