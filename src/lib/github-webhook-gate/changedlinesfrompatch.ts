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

/** Line numbers in the new file that the unified diff adds or replaces. `null` means the patch was omitted. */
export function changedLinesFromPatch(patch: string | null | undefined): Set<number> | null {
  if (patch == null) return null;
  const lines = new Set<number>();
  let next = 0;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk?.[1]) {
      next = Number(hunk[1]);
      continue;
    }
    if (line.startsWith("\\") || line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      lines.add(next);
      next += 1;
      continue;
    }
    if (line.startsWith("-")) continue;
    if (next > 0) next += 1;
  }
  return lines;
}
