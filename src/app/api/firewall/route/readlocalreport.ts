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
import { REPORT_PATH } from "./report-path";
import { LOCAL_TARGET } from "./local-target";
import { reportFrom } from "./reportfrom";

export async function readLocalReport(): Promise<FirewallResponse> {
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
