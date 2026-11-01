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
import type { GatePullFile } from "./gatepullfile";
import type { GithubGateClient } from "./githubgateclient";
import { decodeBlob } from "./decodeblob";
import { statusOf } from "./statusof";

export async function createGithubGateClient(owner: string, repo: string): Promise<GithubGateClient> {
  const access = await resolveGithubRepoAccessToken(owner, repo);
  if (!access.ok) {
    throw new Error(access.message);
  }
  const octokit = new Octokit({ auth: access.token, userAgent: "provix-architecture-firewall" });
  return {
    async listPullFiles(input) {
      const files: GatePullFile[] = [];
      for (let page = 1; page <= 3; page += 1) {
        const response = await octokit.rest.pulls.listFiles({
          owner: input.owner,
          repo: input.repo,
          pull_number: input.number,
          per_page: 100,
          page,
        });
        for (const file of response.data) {
          if (!file.sha) continue;
          files.push({
            filename: file.filename,
            status: file.status,
            sha: file.sha,
            patch: file.patch,
          });
        }
        if (response.data.length < 100) break;
      }
      return files;
    },
    async readFile(input) {
      const blob = await octokit.rest.git.getBlob({
        owner: input.owner,
        repo: input.repo,
        file_sha: input.sha,
      });
      return decodeBlob(blob.data.content, blob.data.encoding);
    },
    async postStatus(input) {
      await octokit.rest.repos.createCommitStatus({
        owner: input.owner,
        repo: input.repo,
        sha: input.sha,
        state: input.payload.state,
        context: input.payload.context,
        description: input.payload.description,
        target_url: input.payload.target_url,
      });
    },
    async postComment(input) {
      await octokit.rest.issues.createComment({
        owner: input.owner,
        repo: input.repo,
        issue_number: input.number,
        body: input.body,
      });
    },
    async commitMessage(input) {
      const commit = await octokit.rest.git.getCommit({
        owner: input.owner,
        repo: input.repo,
        commit_sha: input.sha,
      });
      return commit.data.message;
    },
    async branchHead(input) {
      const ref = await octokit.rest.git.getRef({
        owner: input.owner,
        repo: input.repo,
        ref: `heads/${input.branch}`,
      });
      const commit = await octokit.rest.git.getCommit({
        owner: input.owner,
        repo: input.repo,
        commit_sha: ref.data.object.sha,
      });
      return { sha: ref.data.object.sha, message: commit.data.message };
    },
    async readTextFile(input) {
      try {
        const response = await octokit.rest.repos.getContent({
          owner: input.owner,
          repo: input.repo,
          path: input.path,
          ref: input.ref,
        });
        if (Array.isArray(response.data) || response.data.type !== "file" || !("content" in response.data)) return null;
        return decodeBlob(response.data.content, response.data.encoding ?? "base64");
      } catch (error) {
        if (statusOf(error) === 404) return null;
        throw error;
      }
    },
    async commitToBranch(input) {
      const parent = await octokit.rest.git.getCommit({
        owner: input.owner,
        repo: input.repo,
        commit_sha: input.parentSha,
      });
      const tree = await octokit.rest.git.createTree({
        owner: input.owner,
        repo: input.repo,
        base_tree: parent.data.tree.sha,
        tree: input.files.map((file) => ({
          path: file.path,
          mode: "100644" as const,
          type: "blob" as const,
          content: file.content,
        })),
      });
      const commit = await octokit.rest.git.createCommit({
        owner: input.owner,
        repo: input.repo,
        message: input.message,
        tree: tree.data.sha,
        parents: [input.parentSha],
      });
      await octokit.rest.git.updateRef({
        owner: input.owner,
        repo: input.repo,
        ref: `heads/${input.branch}`,
        sha: commit.data.sha,
      });
      return { sha: commit.data.sha };
    },
  };
}
