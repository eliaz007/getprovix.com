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
import { json } from "./json";
import { readLocalReport } from "./readlocalreport";
import { repoUrlFrom } from "./repourlfrom";

export async function POST(request: Request) {
  let body: FirewallScanRequest;
  try {
    body = (await request.json()) as FirewallScanRequest;
  } catch {
    return json(
      {
        ok: false,
        source: "local",
        status: "error",
        message: "Request body must be JSON.",
        target: null,
        report: null,
      },
      400
    );
  }

  const repoUrl = repoUrlFrom(body);
  const wantsGithub = body.source === "github" || repoUrl !== null;
  if (!wantsGithub) {
    const report = await readLocalReport();
    return json(report, report.status === "error" ? 500 : 200);
  }

  if (!repoUrl) {
    return json(
      {
        ok: false,
        source: "github",
        status: "error",
        message: "A GitHub scan needs repoUrl or githubUrl.",
        target: null,
        report: null,
      },
      400
    );
  }

  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return json(
      {
        ok: false,
        source: "github",
        status: "error",
        message: "Sign in to scan a repository.",
        target: null,
        report: null,
      },
      401
    );
  }

  const parsed = parseGitHubRepository(repoUrl);
  if (!parsed) {
    return json(
      {
        ok: false,
        source: "github",
        status: "error",
        message: "Paste a public GitHub URL or owner/repo.",
        target: null,
        report: null,
      },
      400
    );
  }

  const granted = await authorizeFirewallRepoAccess({
    supabase: session.supabase,
    userId: session.user.id,
    owner: parsed.owner,
    repo: parsed.repo,
    githubToken: readProvidedGithubToken(body.githubToken),
    purpose: "scan",
  });
  if (!granted.ok) {
    return json(
      {
        ok: false,
        source: "github",
        status: "error",
        message: granted.message,
        target: { kind: "github", repoUrl: parsed.repoUrl },
        report: null,
      },
      granted.status
    );
  }

  const scanned = await scanPublicGitHubRepo(repoUrl, granted.token);
  return json(scanned.body, scanned.status);
}
