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

export type ListedFile = {
  filename: string;
  status: string;
  sha: string;
  patch?: string | null;
  content: string;
};
