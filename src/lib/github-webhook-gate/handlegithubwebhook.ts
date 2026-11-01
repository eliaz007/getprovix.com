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
import { FILE_CAP } from "./file-cap";
import type { GatePullFile } from "./gatepullfile";
import type { GithubGateClient } from "./githubgateclient";
import { json } from "./json";
import { verifyGithubSignature } from "./verifygithubsignature";
import { buildGateStatus } from "./buildgatestatus";
import { healQueueUrl } from "./healqueueurl";
import { gateComment } from "./gatecomment";
import { healComment } from "./healcomment";
import { isSourceFile } from "./issourcefile";
import { isCompanionFile } from "./iscompanionfile";
import { scanChangedFiles } from "./scanchangedfiles";
import { parseDelivery } from "./parsedelivery";
import { createGithubGateClient } from "./creategithubgateclient";
import { commitAutonomousHeal } from "./commitautonomousheal";

export async function handleGithubWebhook(request: Request, client?: GithubGateClient): Promise<Response> {
  const body = Buffer.from(await request.arrayBuffer());
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) {
    return json({ ok: false, message: "GITHUB_WEBHOOK_SECRET is not set." }, 500);
  }
  if (!verifyGithubSignature(body, request.headers.get("x-hub-signature-256"), secret)) {
    return json({ ok: false, message: "Invalid webhook signature." }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf8")) as unknown;
  } catch {
    return json({ ok: false, message: "Webhook body is not JSON." }, 400);
  }

  const delivery = parseDelivery(request.headers.get("x-github-event"), payload);
  if (delivery === "ignore") return json({ ok: true, ignored: true });
  if (delivery === "invalid") return json({ ok: false, message: "Pull request payload is missing owner, repo, number, or sha." }, 400);

  const appConfigured = Boolean(
    process.env.GITHUB_APP_ID?.trim() && process.env.GITHUB_APP_PRIVATE_KEY?.trim()
  );
  let gate: GithubGateClient;
  try {
    gate = client ?? (await createGithubGateClient(delivery.owner, delivery.repo));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Provix could not get GitHub access for this repository. Install the GitHub App on the repo and try again.";
    return json({ ok: false, message }, 500);
  }
  // createGithubGateClient refuses PAT fallback when App creds are set, so this is accurate.
  const authSource = client ? "injected" : appConfigured ? "github_app" : "github_token_fallback";

  let files: GatePullFile[];
  try {
    files = await gate.listPullFiles(delivery);
  } catch (error) {
    console.error("[webhooks/github] could not list pull request files", error instanceof Error ? error.message : error);
    return json({ ok: false, message: "GitHub did not return the pull request diff." }, 502);
  }

  const selected = files
    .filter((file) => file.status !== "removed" && (isSourceFile(file.filename) || isCompanionFile(file.filename)))
    .slice(0, FILE_CAP);
  const readable: Array<{ filePath: string; content: string; patch?: string | null }> = [];
  try {
    for (const file of selected) {
      const content = await gate.readFile({ owner: delivery.owner, repo: delivery.repo, sha: file.sha });
      if (content === null) continue;
      readable.push({ filePath: file.filename, content, patch: file.patch });
    }
  } catch (error) {
    console.error("[webhooks/github] could not read a changed file", error instanceof Error ? error.message : error);
    return json({ ok: false, message: "GitHub did not return a changed file." }, 502);
  }

  const scan = scanChangedFiles(readable);
  const committed = await commitAutonomousHeal(gate, delivery, readable, scan.findings);
  // Status on this delivery sha reflects the tree GitHub sent. Residual after in-memory
  // rounds is reported on the heal comment; the follow-up synchronize posts the head status.
  const reportFindings = committed?.residual ?? scan;
  const healUrl = healQueueUrl(
    delivery.owner,
    delivery.repo,
    reportFindings.leaks,
    reportFindings.violations
  );
  const payloadStatus = buildGateStatus(scan.leaks, scan.violations, healUrl);
  let statusPosted = false;
  let statusError: string | null = null;
  try {
    await gate.postStatus({
      owner: delivery.owner,
      repo: delivery.repo,
      sha: delivery.sha,
      payload: payloadStatus,
    });
    statusPosted = true;
  } catch (error) {
    // Missing "Commit statuses" App permission still returns 403; keep the gate alive via PR comment.
    statusError = error instanceof Error ? error.message : "status publish failed";
    console.error("[webhooks/github] could not publish the status check", statusError);
  }

  let commentError: string | null = null;
  try {
    if (committed) {
      const residualLeftover =
        committed.residual.leaks > 0 ||
        committed.residual.violations > 0 ||
        committed.residual.findings.length > 0;
      await gate.postComment({
        owner: delivery.owner,
        repo: delivery.repo,
        number: delivery.number,
        body: healComment({
          branch: delivery.branch,
          notes: committed.notes,
          residual: residualLeftover
            ? {
                leaks: committed.residual.leaks,
                violations: committed.residual.violations,
                findings: committed.residual.findings,
                healUrl,
              }
            : undefined,
        }),
      });
    } else if (payloadStatus.state === "failure" || !statusPosted) {
      const fallback =
        statusPosted
          ? gateComment({ ...scan, healUrl })
          : `${gateComment({ ...scan, healUrl })}\n\n_Provix could not publish \`${GATE_CONTEXT}\` — grant the GitHub App **Commit statuses: Read and write** permission, then re-run._`;
      await gate.postComment({
        owner: delivery.owner,
        repo: delivery.repo,
        number: delivery.number,
        body: fallback,
      });
    }
  } catch (error) {
    commentError = error instanceof Error ? error.message : "comment publish failed";
    console.error("[webhooks/github] could not comment on the pull request", commentError);
    if (!statusPosted) {
      const keyRaw = process.env.GITHUB_APP_PRIVATE_KEY?.trim() ?? "";
      return json(
        {
          ok: false,
          message: "GitHub did not accept the status check or PR comment.",
          authSource,
          statusError,
          commentError,
          // Safe diagnostics only — never echo the key.
          appIdSet: Boolean(process.env.GITHUB_APP_ID?.trim()),
          privateKeySet: Boolean(keyRaw),
          privateKeyStartsWithQuote: keyRaw.startsWith('"') || keyRaw.startsWith("'"),
          privateKeyLooksLikePem: keyRaw.includes("BEGIN"),
        },
        502
      );
    }
  }

  return json({
    ok: true,
    state: payloadStatus.state,
    leaks: scan.leaks,
    violations: scan.violations,
    residualLeaks: committed?.residual.leaks ?? scan.leaks,
    residualViolations: committed?.residual.violations ?? scan.violations,
    healRounds: committed?.rounds ?? 0,
    context: payloadStatus.context,
    description: payloadStatus.description,
    healed: Boolean(committed),
    commitSha: committed?.sha,
    statusPosted,
  });
}
