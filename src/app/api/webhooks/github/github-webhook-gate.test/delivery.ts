import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/github/route";
import {
  GATE_CONTEXT,
  HEAL_COMMIT_PREFIX,
  buildGateStatus,
  gateComment,
  gateDescription,
  gateFixForFinding,
  handleGithubWebhook,
  signGithubBody,
  verifyGithubSignature,
  type GateStatusPayload,
  type GithubGateClient,
} from "@/lib/github-webhook-gate";

export function delivery(action: "opened" | "synchronize" | "closed" = "opened") {
  return JSON.stringify({
    action,
    repository: { name: "getprovix.com", owner: { login: "eliaz007" } },
    pull_request: { number: 41, head: { sha: "abc123def4567890", ref: "provix/fix-login" } },
  });
}
