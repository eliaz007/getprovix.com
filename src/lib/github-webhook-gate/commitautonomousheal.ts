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
import type { GithubGateClient } from "./githubgateclient";
import type { PullRequestDelivery } from "./pullrequestdelivery";
import { json } from "./json";
import { healCommitMessage } from "./healcommitmessage";
import { isAutonomousHealCommit } from "./isautonomoushealcommit";
import type { HealRoundsResult } from "./healroundsresult";
import { runAutonomousHealRounds } from "./runautonomoushealrounds";

export async function commitAutonomousHeal(
  gate: GithubGateClient,
  delivery: PullRequestDelivery,
  readable: Array<{ filePath: string; content: string; patch?: string | null }>,
  findings: readonly GateFinding[]
): Promise<{
  sha: string;
  notes: string[];
  rounds: number;
  residual: { leaks: number; violations: number; findings: GateFinding[] };
} | null> {
  if (!gate.commitToBranch) return null;
  try {
    if (gate.commitMessage) {
      const message = await gate.commitMessage({ owner: delivery.owner, repo: delivery.repo, sha: delivery.sha });
      if (isAutonomousHealCommit(message)) return null;
    }
    if (gate.branchHead) {
      const head = await gate.branchHead({ owner: delivery.owner, repo: delivery.repo, branch: delivery.branch });
      if (head.sha !== delivery.sha && isAutonomousHealCommit(head.message, delivery.sha)) return null;
    }
  } catch (error) {
    console.error("[webhooks/github] could not read the pull request head", error instanceof Error ? error.message : error);
  }

  let tsconfigText =
    readable.find((file: (typeof readable)[number]) => file.filePath === "tsconfig.json" || file.filePath.endsWith("/tsconfig.json"))?.content ?? null;
  const readText = async (filePath: string) => {
    if (!gate.readTextFile) return null;
    return gate.readTextFile({ owner: delivery.owner, repo: delivery.repo, path: filePath, ref: delivery.sha });
  };
  if (!tsconfigText && gate.readTextFile) {
    try {
      tsconfigText = await readText("tsconfig.json");
    } catch (error) {
      console.error("[webhooks/github] could not read tsconfig.json", error instanceof Error ? error.message : error);
      tsconfigText = null;
    }
  }

  let roundsResult: HealRoundsResult | null = null;
  try {
    roundsResult = await runAutonomousHealRounds({
      files: readable,
      findings,
      tsconfigText,
      readText,
    });
  } catch (error) {
    console.error("[webhooks/github] autonomous heal did not finish", error instanceof Error ? error.message : error);
    return null;
  }
  if (!roundsResult) return null;

  try {
    const commit = await gate.commitToBranch({
      owner: delivery.owner,
      repo: delivery.repo,
      branch: delivery.branch,
      parentSha: delivery.sha,
      message: healCommitMessage(delivery.sha, roundsResult.notes),
      files: roundsResult.files,
    });
    return {
      sha: commit.sha,
      notes: roundsResult.notes,
      rounds: roundsResult.rounds,
      residual: {
        leaks: roundsResult.leaks,
        violations: roundsResult.violations,
        findings: roundsResult.findings,
      },
    };
  } catch (error) {
    console.error("[webhooks/github] could not commit the autonomous heal", error instanceof Error ? error.message : error);
    return null;
  }
}
