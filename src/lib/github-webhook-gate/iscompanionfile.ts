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
import { LOCKFILES } from "./lockfiles";
import { json } from "./json";
import { normalizedPath } from "./normalizedpath";
import { isIgnored } from "./isignored";
import { isSourceFile } from "./issourcefile";

export function isCompanionFile(filePath: string): boolean {
  if (isIgnored(filePath) || isSourceFile(filePath)) return false;
  const name = normalizedPath(filePath).split("/").pop() ?? filePath;
  if (LOCKFILES.has(name)) return false;
  if (name === "package.json" || name === ".env" || name.startsWith(".env.")) return true;
  return name.endsWith(".json");
}
