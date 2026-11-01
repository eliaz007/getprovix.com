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
import type { PullRequestDelivery } from "./pullrequestdelivery";
import { readString } from "./readstring";
import { isPullRequestBranch } from "./ispullrequestbranch";

export function parseDelivery(eventName: string | null, payload: unknown): PullRequestDelivery | "ignore" | "invalid" {
  if (eventName === "ping") return "ignore";
  if (eventName !== "pull_request") return "ignore";
  if (!payload || typeof payload !== "object") return "invalid";
  const body = payload as {
    action?: unknown;
    repository?: { name?: unknown; owner?: { login?: unknown } };
    pull_request?: { number?: unknown; head?: { sha?: unknown; ref?: unknown } };
  };
  const action = readString(body.action);
  if (action !== "opened" && action !== "synchronize") return "ignore";
  const owner = readString(body.repository?.owner?.login);
  const repo = readString(body.repository?.name);
  const sha = readString(body.pull_request?.head?.sha);
  const branch = readString(body.pull_request?.head?.ref);
  const number = body.pull_request?.number;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return "invalid";
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) return "invalid";
  if (!isPullRequestBranch(branch)) return "invalid";
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) return "invalid";
  return { owner, repo, number, sha, branch };
}
