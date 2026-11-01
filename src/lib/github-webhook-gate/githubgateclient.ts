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
import type { GateStatusPayload } from "./gatestatuspayload";
import type { HealCommitFile } from "./healcommitfile";
import type { GatePullFile } from "./gatepullfile";

export type GithubGateClient = {
  listPullFiles(input: { owner: string; repo: string; number: number }): Promise<GatePullFile[]>;
  readFile(input: { owner: string; repo: string; sha: string }): Promise<string | null>;
  postStatus(input: { owner: string; repo: string; sha: string; payload: GateStatusPayload }): Promise<void>;
  postComment(input: { owner: string; repo: string; number: number; body: string }): Promise<void>;
  commitToBranch?(input: {
    owner: string;
    repo: string;
    branch: string;
    parentSha: string;
    message: string;
    files: HealCommitFile[];
  }): Promise<{ sha: string }>;
  commitMessage?(input: { owner: string; repo: string; sha: string }): Promise<string>;
  branchHead?(input: { owner: string; repo: string; branch: string }): Promise<{ sha: string; message: string }>;
  readTextFile?(input: { owner: string; repo: string; path: string; ref: string }): Promise<string | null>;
};
