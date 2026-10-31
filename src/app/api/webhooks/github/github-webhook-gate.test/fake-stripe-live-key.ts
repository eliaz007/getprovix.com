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

export /** Built at runtime so GitHub push protection does not flag a Stripe-shaped literal. */
const FAKE_STRIPE_LIVE_KEY = `sk_live_${"a".repeat(24)}`;
