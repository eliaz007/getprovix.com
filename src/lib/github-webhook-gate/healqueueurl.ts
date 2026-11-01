import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { Octokit } from "@octokit/rest";
import { NextResponse } from "next/server";
import { analyzeSourceTexts, type SourceTextFile } from "../../../scripts/ingest-engine";
import { finalizeAutofixWrites } from "@/lib/autofix-write-validation";
import {
  isSecurityCategory,
  violationCategory,
  type FirewallCategory,
  type FirewallRemediation,
  type FirewallViolation,
} from "@/lib/firewall-contract";
import { resolveGithubRepoAccessToken } from "@/lib/github-app-client";
import { isRepositoryTextPath } from "@/lib/github-source-file";
import {
  isServerActionFilePath,
  isSupportingHelperPath,
  mergeEnvExample,
  mergeServerAction,
  missingSupportingHelperWrites,
  pickNextSecurityFindingForBatch,
  planSecurityFix,
  resolveSecurityFixLayout,
  sortFindingsForBatchApply,
} from "@/lib/scanner/security-suite";

export function healQueueUrl(owner: string, repo: string, leaks: number, violations: number): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim().replace(/\/$/, "");
  const base = configured || (vercel ? `https://${vercel}` : "http://localhost:3000");
  const params = new URLSearchParams({ repo: `${owner}/${repo}` });
  if (leaks > 0 && violations === 0) params.set("view", "leaks");
  else if (violations > 0) params.set("view", "violations");
  return `${base}/firewall?${params.toString()}`;
}
