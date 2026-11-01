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
import type { GateFinding } from "./gatefinding";
import { gateFixForFinding } from "./gatefixforfinding";
import { changedLinesFromPatch } from "./changedlinesfrompatch";
import { normalizedPath } from "./normalizedpath";
import { isSourceFile } from "./issourcefile";
import { isCompanionFile } from "./iscompanionfile";
import { findingKind } from "./findingkind";

export function scanChangedFiles(
  files: Array<{ filePath: string; content: string; patch?: string | null }>
): { leaks: number; violations: number; findings: GateFinding[] } {
  const sources: SourceTextFile[] = [];
  const companions: SourceTextFile[] = [];
  const changed = new Map<string, Set<number> | null>();

  for (const file of files) {
    const filePath = normalizedPath(file.filePath);
    if (!filePath || file.content.includes("\u0000")) continue;
    changed.set(filePath, changedLinesFromPatch(file.patch));
    const entry = { filePath, content: file.content };
    if (isSourceFile(filePath)) sources.push(entry);
    else if (isCompanionFile(filePath)) companions.push(entry);
  }

  if (sources.length === 0 && companions.length === 0) {
    return { leaks: 0, violations: 0, findings: [] };
  }

  const report = analyzeSourceTexts(sources, { includeOrphans: false, companionFiles: companions });
  const findings: GateFinding[] = [];
  for (const violation of report.violations) {
    const filePath = normalizedPath(violation.filePath);
    const lines = changed.get(filePath);
    if (lines && violation.line > 0 && !lines.has(violation.line)) continue;
    const category = violationCategory(violation);
    findings.push({
      filePath,
      line: violation.line,
      rule: violation.rule,
      kind: findingKind(violation),
      category,
      message: violation.message.trim() || violation.rule,
      fix: gateFixForFinding({
        category,
        rule: violation.rule,
        remediation: violation.remediation,
      }),
    });
  }

  const leaks = findings.filter((finding: GateFinding) => finding.kind === "leak").length;
  return { leaks, violations: findings.length - leaks, findings };
}
