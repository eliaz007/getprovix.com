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
import { GATE_CONTEXT } from "./gate-context";
import type { GateStatusPayload } from "./gatestatuspayload";
import { gateDescription } from "./gatedescription";

export function buildGateStatus(leaks: number, violations: number, targetUrl: string): GateStatusPayload {
  const failed = leaks > 0 || violations > 0;
  return {
    state: failed ? "failure" : "success",
    context: GATE_CONTEXT,
    description: gateDescription(leaks, violations).slice(0, 140),
    target_url: targetUrl,
  };
}
