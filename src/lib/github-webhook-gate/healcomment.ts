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
import { gateComment } from "./gatecomment";

export function healComment(input: {
  branch: string;
  notes: readonly string[];
  residual?: {
    leaks: number;
    violations: number;
    findings: GateFinding[];
    healUrl: string;
  };
}): string {
  const header = [
    "```",
    "provix/autonomous-heal",
    `committed to ${input.branch}`,
    ...input.notes,
    "```",
    "",
  ];
  const residual = input.residual;
  if (residual && (residual.leaks > 0 || residual.violations > 0 || residual.findings.length > 0)) {
    return [
      ...header,
      "Partial heal: some findings remain after autonomous rounds.",
      "",
      gateComment(residual),
    ].join("\n");
  }
  return [...header, "Validation passed. The patch is on the pull request branch."].join("\n");
}
