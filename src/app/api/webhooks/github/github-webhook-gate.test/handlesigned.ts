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
import { signature } from "./signature";
import { requestFor } from "./requestfor";

export function handleSigned(body: string, gate: GithubGateClient) {
  return handleGithubWebhook(requestFor(body, signature(body)), gate);
}
