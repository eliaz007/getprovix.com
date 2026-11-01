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
import { COMMENT_CAP } from "./comment-cap";
import type { GateFinding } from "./gatefinding";
import { gateDescription } from "./gatedescription";
import { gateFixForFinding } from "./gatefixforfinding";

export function gateComment(input: {
  leaks: number;
  violations: number;
  findings: GateFinding[];
  healUrl: string;
}): string {
  const shown = input.findings.slice(0, COMMENT_CAP);
  const hidden = input.findings.length - shown.length;
  const blocks = shown.map((finding: (typeof shown)[number], index: number) => {
    const why = finding.message.trim() || finding.rule;
    const fix = finding.fix.trim() || gateFixForFinding(finding);
    return [
      `**${index + 1}. \`${finding.filePath}:${finding.line}\`** — ${why}`,
      `Fix: ${fix}`,
    ].join("\n");
  });
  if (hidden > 0) blocks.push(`_…and ${hidden} more in the Heal queue._`);

  return [
    "### Provix Architecture Firewall",
    `**${gateDescription(input.leaks, input.violations)}**`,
    "",
    ...blocks.flatMap((block, index) => (index === 0 ? [block] : ["", block])),
    "",
    `[Open Heal queue](${input.healUrl})`,
  ].join("\n");
}
