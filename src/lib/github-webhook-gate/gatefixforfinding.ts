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

/** Short fix guidance for a gate finding (category / rule / remediation). */
export function gateFixForFinding(input: {
  category: FirewallCategory;
  rule: string;
  remediation?: FirewallRemediation;
}): string {
  if (input.remediation?.command?.trim()) return input.remediation.command.trim();
  if (input.remediation?.envExample?.trim()) {
    const name = input.remediation.envExample.replace(/=$/, "").trim();
    return `Move the secret into an environment variable${name ? ` (${name})` : ""} and remove it from source.`;
  }
  switch (input.category) {
    case "SECRET_LEAK":
      return "Move the secret into an environment variable and remove it from source.";
    case "CLIENT_DB_EXPOSURE":
      return "Move the query into a server action that checks supabase.auth.getUser().";
    case "VULNERABLE_DEPENDENCY":
      return "Upgrade or replace the vulnerable / deprecated dependency.";
    default:
      break;
  }
  if (input.rule === "Circular Dependency") return "Break the circular import between these modules.";
  if (input.rule === "Architectural Bloat") return "Split the file or reduce its responsibilities.";
  if (input.rule === "Dead Weight / Orphaned Code") {
    return "Delete the unused module or import it from a real entrypoint.";
  }
  if (input.rule === "Boundary Violation") {
    return "Keep admin clients, service-role keys, and raw SQL on the server.";
  }
  return "Open the Heal queue for the suggested patch.";
}
