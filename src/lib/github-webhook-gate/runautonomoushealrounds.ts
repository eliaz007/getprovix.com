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
import { HEAL_MAX_ROUNDS } from "./heal-max-rounds";
import type { GateFinding } from "./gatefinding";
import type { AutonomousHeal } from "./autonomousheal";
import type { HealRoundsResult } from "./healroundsresult";
import { prepareAutonomousHeal } from "./prepareautonomousheal";
import { normalizedPath } from "./normalizedpath";
import { scanChangedFiles } from "./scanchangedfiles";

/**
 * Apply prepareAutonomousHeal up to `maxRounds` times in memory, re-scanning after each
 * round, then return one merged write set for a single commit.
 */
export async function runAutonomousHealRounds(input: {
  files: ReadonlyArray<{ filePath: string; content: string; patch?: string | null }>;
  findings: readonly GateFinding[];
  tsconfigText?: string | null;
  readText?: (filePath: string) => Promise<string | null>;
  maxRounds?: number;
}): Promise<HealRoundsResult | null> {
  const maxRounds = input.maxRounds ?? HEAL_MAX_ROUNDS;
  const working = new Map<string, { filePath: string; content: string; patch?: string | null }>();
  const originalPaths = new Set<string>();
  for (const file of input.files) {
    const filePath = normalizedPath(file.filePath);
    originalPaths.add(filePath);
    working.set(filePath, { filePath, content: file.content, patch: file.patch });
  }

  let findings = input.findings.slice();
  let leaks = findings.filter((finding: GateFinding) => finding.kind === "leak").length;
  let violations = findings.filter((finding: GateFinding) => finding.kind === "violation").length;
  const allNotes: string[] = [];
  const writeMap = new Map<string, string>();
  let rounds = 0;
  let improved = false;

  for (let round = 1; round <= maxRounds; round += 1) {
    if (findings.length === 0) break;
    const beforeCount = findings.length;
    const snapshot = [...working.values()];
    let heal: AutonomousHeal | null = null;
    try {
      heal = await prepareAutonomousHeal({
        files: snapshot,
        findings,
        tsconfigText: input.tsconfigText,
        readText: input.readText,
      });
    } catch (error) {
      console.error(
        "[webhooks/github] heal round failed",
        round,
        error instanceof Error ? error.message : error
      );
      break;
    }
    if (!heal || heal.files.length === 0) break;

    rounds = round;
    improved = true;
    allNotes.push(`round ${round}`);
    for (const note of heal.notes) allNotes.push(note);
    for (const file of heal.files) {
      const filePath = normalizedPath(file.path);
      writeMap.set(filePath, file.content);
      const previous = working.get(filePath);
      // New files (e.g. secure-query.ts): full-file scan. Existing PR files: keep the
      // original patch filter so residuals stay scoped to the pull request diff.
      const patch = originalPaths.has(filePath) ? previous?.patch ?? null : null;
      working.set(filePath, { filePath, content: file.content, patch });
    }

    const scan = scanChangedFiles([...working.values()]);
    findings = scan.findings;
    leaks = scan.leaks;
    violations = scan.violations;
    if (findings.length === 0) break;
    if (findings.length >= beforeCount) break;
  }

  if (!improved || writeMap.size === 0) return null;
  return {
    files: [...writeMap.entries()].map(([path, content]) => ({ path, content })),
    notes: allNotes,
    findings,
    leaks,
    violations,
    improved,
    rounds,
  };
}
