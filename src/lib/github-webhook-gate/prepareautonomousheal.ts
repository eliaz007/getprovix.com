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
import type { AutonomousHeal } from "./autonomousheal";
import { normalizedPath } from "./normalizedpath";

/** Build a validated patch for fixable client-boundary leaks and security findings. */
export async function prepareAutonomousHeal(input: {
  files: ReadonlyArray<{ filePath: string; content: string }>;
  findings: readonly GateFinding[];
  tsconfigText?: string | null;
  readText?: (filePath: string) => Promise<string | null>;
}): Promise<AutonomousHeal | null> {
  const contents = new Map<string, string>();
  for (const file of input.files) contents.set(normalizedPath(file.filePath), file.content);
  const extras = new Map<string, string>();
  const notes: string[] = [];
  // Global batch order: category → file → descending line (447 before 419).
  const seeds = sortFindingsForBatchApply(
    input.findings.filter((finding: (typeof input.findings)[number]) => isSecurityCategory(finding.category))
  );

  const started = new Set<string>();
  for (const seed of seeds) {
    const filePath = normalizedPath(seed.filePath);
    if (started.has(filePath) || !contents.has(filePath)) continue;
    started.add(filePath);
    for (let pass = 0; pass < 5; pass += 1) {
      const content = contents.get(filePath);
      if (content == null) break;
      // Re-scan and always take the highest remaining line so prior edits cannot
      // invalidate coordinates still scheduled higher in the file.
      const live = pickNextSecurityFindingForBatch({ filePath, content });
      if (!live || !isSecurityCategory(live.category)) break;
      const layout =
        live.category === "CLIENT_DB_EXPOSURE"
          ? resolveSecurityFixLayout({ clientFilePath: filePath, tsconfigContents: [input.tsconfigText] })
          : null;
      const plan = planSecurityFix({ filePath, content }, live.category, live.line, layout);
      if (!plan || plan.writes.length === 0) break;
      let changed = false;
      for (const write of plan.writes) {
        const path = normalizedPath(write.filePath);
        if (!isRepositoryTextPath(path)) return null;
        let next = write.content;
        if (write.appendLine) {
          const existing = extras.get(path) ?? contents.get(path) ?? (await input.readText?.(path)) ?? null;
          next = mergeEnvExample(existing, write.appendLine);
        } else if (isSupportingHelperPath(path) && path !== filePath) {
          const existing = extras.get(path) ?? contents.get(path) ?? (await input.readText?.(path)) ?? null;
          // Keep an existing createClient helper; only scaffold when the repo has none.
          if (existing != null) continue;
          next = write.content;
        } else if (isServerActionFilePath(path) && path !== filePath) {
          const existing = extras.get(path) ?? contents.get(path) ?? (await input.readText?.(path)) ?? null;
          next = mergeServerAction(existing, write.content);
        }
        if (path === filePath) {
          if (next !== content) changed = true;
          contents.set(path, next);
        } else if (extras.get(path) !== next) {
          changed = true;
          extras.set(path, next);
        }
      }
      notes.push(`${filePath}:${live.line}  ${live.category}  ${plan.title}`);
      if (!changed) break;
    }
  }

  if (notes.length === 0) return null;
  const writes: Array<{ filePath: string; content: string }> = [];
  for (const [filePath, content] of contents) {
    const original = input.files.find((file) => normalizedPath(file.filePath) === filePath)?.content;
    if (original !== undefined && original === content) continue;
    writes.push({ filePath, content });
  }
  for (const [filePath, content] of extras) writes.push({ filePath, content });

  // Bundle any scaffoldable helpers the patch imports that still are not in the payload.
  const layout = resolveSecurityFixLayout({
    clientFilePath: writes[0]?.filePath ?? "src/app/actions/secure-query.ts",
    tsconfigContents: [input.tsconfigText],
  });
  for (const helper of missingSupportingHelperWrites(writes, layout)) {
    const path = normalizedPath(helper.filePath);
    if (!isRepositoryTextPath(path)) return null;
    if (writes.some((write: (typeof writes)[number]) => normalizedPath(write.filePath) === path)) continue;
    const existing = contents.get(path) ?? extras.get(path) ?? (await input.readText?.(path)) ?? null;
    if (existing != null) continue;
    writes.push({ filePath: path, content: helper.content });
    extras.set(path, helper.content);
  }

  if (writes.length === 0) return null;

  // After helper bundling: heal, then `npx tsc --noEmit`. Failure reverts and aborts the commit.
  const healed = await finalizeAutofixWrites(writes);
  if (!healed.ok) {
    console.error("[webhooks/github] autonomous heal failed validation", healed.message);
    return null;
  }
  return {
    message: notes.join("\n"),
    files: healed.writes.map((write) => ({ path: write.filePath, content: write.content })),
    notes,
  };
}
