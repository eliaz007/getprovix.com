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

export function gateDescription(leaks: number, violations: number): string {
  const leakLabel = `${leaks} ${leaks === 1 ? "leak" : "leaks"}`;
  const violationLabel = `${violations} ${violations === 1 ? "violation" : "violations"}`;
  const summary = `${leakLabel}, ${violationLabel}`;
  if (leaks === 0 && violations === 0) return `${summary}. Ready to merge.`;
  return `${summary}. See PR comment.`;
}
