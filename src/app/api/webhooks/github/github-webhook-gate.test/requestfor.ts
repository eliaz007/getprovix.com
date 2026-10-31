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

export function requestFor(body: string, header: string | null, event = "pull_request") {
  const headers = new Headers({ "content-type": "application/json", "x-github-event": event });
  if (header) headers.set("x-hub-signature-256", header);
  return new Request("http://localhost:3000/api/webhooks/github", { method: "POST", headers, body });
}
