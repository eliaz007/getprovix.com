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
import { SECRET } from "./secret";
import { FAKE_STRIPE_LIVE_KEY } from "./fake-stripe-live-key";
import { signature } from "./signature";
import { delivery } from "./delivery";
import { requestFor } from "./requestfor";
import type { ListedFile } from "./listedfile";
import { handleSigned } from "./handlesigned";

export function recordingClient(file: ListedFile, commitMessage = "") {
  const statuses: Array<{ sha: string; payload: GateStatusPayload }> = [];
  const comments: string[] = [];
  const commits: Array<{ branch: string; parentSha: string; message: string; files: Array<{ path: string; content: string }> }> = [];
  const gate: GithubGateClient = {
    async listPullFiles() {
      return [file];
    },
    async readFile() {
      return file.content;
    },
    async postStatus(input) {
      statuses.push({ sha: input.sha, payload: input.payload });
    },
    async postComment(input) {
      comments.push(input.body);
    },
    async commitMessage() {
      return commitMessage;
    },
    async readTextFile() {
      return null;
    },
    async commitToBranch(input) {
      commits.push({
        branch: input.branch,
        parentSha: input.parentSha,
        message: input.message,
        files: input.files,
      });
      return { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
    },
  };
  return { gate, statuses, comments, commits };
}

describe("github webhook signature", () => {
  const raw = Buffer.from('{"zen":"keep it simple"}');

  it("accepts an HMAC signed with the webhook secret", () => {
    const header = signGithubBody(raw, SECRET);
    expect(verifyGithubSignature(raw, header, SECRET)).toBe(true);
  });

  it("rejects a missing, forged, or truncated signature", () => {
    expect(verifyGithubSignature(raw, null, SECRET)).toBe(false);
    expect(verifyGithubSignature(raw, signGithubBody(raw, "other-secret"), SECRET)).toBe(false);
    expect(verifyGithubSignature(raw, "sha256=abcd", SECRET)).toBe(false);
    expect(verifyGithubSignature(raw, signGithubBody(raw, SECRET), "")).toBe(false);
  });
});

describe("status check payloads", () => {
  it("marks a clean diff ready to merge", () => {
    expect(gateDescription(0, 0)).toBe("0 leaks, 0 violations. Ready to merge.");
    expect(buildGateStatus(0, 0, "http://localhost:3000/firewall?repo=eliaz007%2Fgetprovix.com")).toEqual({
      state: "success",
      context: GATE_CONTEXT,
      description: "0 leaks, 0 violations. Ready to merge.",
      target_url: "http://localhost:3000/firewall?repo=eliaz007%2Fgetprovix.com",
    });
  });

  it("fails the check with the exact infraction counts", () => {
    expect(buildGateStatus(2, 1, "http://localhost:3000/firewall?repo=acme%2Fdemo&view=violations")).toEqual({
      state: "failure",
      context: GATE_CONTEXT,
      description: "2 leaks, 1 violation. See PR comment.",
      target_url: "http://localhost:3000/firewall?repo=acme%2Fdemo&view=violations",
    });
  });
});

describe("gate PR comment copy", () => {
  it("explains why a finding failed and how to fix it", () => {
    expect(
      gateFixForFinding({
        category: "CLIENT_DB_EXPOSURE",
        rule: "Client DB Exposure",
      })
    ).toContain("server action");

    const body = gateComment({
      leaks: 1,
      violations: 1,
      healUrl: "https://provix.test/firewall?repo=acme%2Fdemo&view=violations",
      findings: [
        {
          filePath: "src/components/billing.tsx",
          line: 5,
          rule: "Hardcoded Secret",
          kind: "leak",
          category: "SECRET_LEAK",
          message: "Stripe secret is committed in source. Move it to STRIPE_SECRET_KEY.",
          fix: "Move the secret into an environment variable (STRIPE_SECRET_KEY) and remove it from source.",
        },
        {
          filePath: "src/components/billing.tsx",
          line: 3,
          rule: "Client DB Exposure",
          kind: "violation",
          category: "CLIENT_DB_EXPOSURE",
          message: "Client component runs a database query.",
          fix: "Move the query into a server action that checks supabase.auth.getUser().",
        },
      ],
    });

    expect(body).toContain("### Provix Architecture Firewall");
    expect(body).toContain("1 leak, 1 violation. See PR comment.");
    expect(body).toContain("`src/components/billing.tsx:5`");
    expect(body).toContain("Stripe secret is committed in source");
    expect(body).toContain("Fix: Move the secret into an environment variable");
    expect(body).toContain("Fix: Move the query into a server action");
    expect(body).toContain("[Open Heal queue](https://provix.test/firewall?repo=acme%2Fdemo&view=violations)");
  });
});

describe("POST /api/webhooks/github", () => {
  const previousSecret = process.env.GITHUB_WEBHOOK_SECRET;
  const previousApp = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.GITHUB_WEBHOOK_SECRET;
    else process.env.GITHUB_WEBHOOK_SECRET = previousSecret;
    if (previousApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousApp;
  });

  it("rejects an unauthorized payload before posting a status", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
    const response = await POST(requestFor(delivery(), signGithubBody(Buffer.from(delivery()), "nope")));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, message: "Invalid webhook signature." });
  });

  it("posts a success check and does not comment when the changed lines are clean", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
    process.env.NEXT_PUBLIC_APP_URL = "https://provix.test";
    const content = "export function add(left: number, right: number) {\n  return left + right;\n}\n";
    const recorded = recordingClient({
      filename: "src/lib/add.ts",
      status: "added",
      sha: "cccccccccccccccccccccccccccccccccccccccc",
      patch: "@@ -0,0 +1,3 @@\n+export function add(left: number, right: number) {\n+  return left + right;\n+}\n",
      content,
    });
    const body = delivery("synchronize");
    const response = await handleSigned(body, recorded.gate);
    expect(response.status).toBe(200);
    expect(recorded.statuses).toEqual([
      {
        sha: "abc123def4567890",
        payload: {
          state: "success",
          context: GATE_CONTEXT,
          description: "0 leaks, 0 violations. Ready to merge.",
          target_url: "https://provix.test/firewall?repo=eliaz007%2Fgetprovix.com",
        },
      },
    ]);
    expect(recorded.comments).toEqual([]);
    expect(recorded.commits).toEqual([]);
  });

  it("fails the check and comments when a changed line leaks or violates a boundary", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
    process.env.NEXT_PUBLIC_APP_URL = "https://provix.test";
    const content = [
      '"use client";',
      "",
      'import { createClient } from "@supabase/supabase-js";',
      "",
      `export const key = "${FAKE_STRIPE_LIVE_KEY}";`,
      "",
    ].join("\n");
    const recorded = recordingClient({
      filename: "src/components/billing.tsx",
      status: "added",
      sha: "dddddddddddddddddddddddddddddddddddddddd",
      patch: [
        "@@ -0,0 +1,5 @@",
        '+"use client";',
        "+",
        '+import { createClient } from "@supabase/supabase-js";',
        "+",
        `+export const key = "${FAKE_STRIPE_LIVE_KEY}";`,
      ].join("\n"),
      content,
    });
    const response = await handleSigned(delivery(), recorded.gate);
    const body = (await response.json()) as { leaks: number; violations: number; description: string; state: string };
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      state: "failure",
      leaks: 1,
      violations: 1,
      description: "1 leak, 1 violation. See PR comment.",
    });
    expect(recorded.statuses[0]?.payload).toEqual({
      state: "failure",
      context: GATE_CONTEXT,
      description: "1 leak, 1 violation. See PR comment.",
      target_url: "https://provix.test/firewall?repo=eliaz007%2Fgetprovix.com&view=violations",
    });
    expect(recorded.commits).toHaveLength(1);
    expect(recorded.commits[0]?.branch).toBe("provix/fix-login");
    expect(recorded.commits[0]?.parentSha).toBe("abc123def4567890");
    expect(recorded.commits[0]?.message.startsWith(`${HEAL_COMMIT_PREFIX} abc123def4567890`)).toBe(true);
    const patched = recorded.commits[0]?.files.find((file: (typeof files)[number]) => file.path === "src/components/billing.tsx")?.content ?? "";
    const example = recorded.commits[0]?.files.find((file: (typeof files)[number]) => file.path === ".env.example")?.content ?? "";
    expect(patched).not.toContain("sk_live_");
    expect(patched).toContain("process.env.STRIPE_SECRET_KEY");
    expect(example).toContain("STRIPE_SECRET_KEY=");
    expect(recorded.comments).toHaveLength(1);
    expect(recorded.comments[0]).toContain("provix/autonomous-heal");
    expect(recorded.comments[0]).toContain("committed to provix/fix-login");
    expect(recorded.comments[0]).toContain("SECRET_LEAK");
    expect(recorded.comments[0]).toMatch(/Validation passed\.|Partial heal:/);
    expect(recorded.comments[0]).not.toContain("sk_live_");
  });

  it("commits a validated server action when a client Supabase query changed", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
    const content = `"use client";\nexport async function load() {\n  return supabase.from("jobs").select("*");\n}\n`;
    const recorded = recordingClient({
      filename: "src/components/jobs.tsx",
      status: "added",
      sha: "ffffffffffffffffffffffffffffffffffffffff",
      patch: [
        "@@ -0,0 +1,4 @@",
        '+"use client";',
        "+export async function load() {",
        '+  return supabase.from("jobs").select("*");',
        "+}",
      ].join("\n"),
      content,
    });
    const response = await handleSigned(delivery(), recorded.gate);
    const body = (await response.json()) as { healed: boolean; commitSha?: string };
    expect(response.status).toBe(200);
    expect(body.healed).toBe(true);
    expect(body.commitSha).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const client = recorded.commits[0]?.files.find((file: (typeof files)[number]) => file.path === "src/components/jobs.tsx")?.content ?? "";
    const action = recorded.commits[0]?.files.find((file: (typeof files)[number]) => file.path === "src/app/actions/secure-query.ts")?.content ?? "";
    const helper = recorded.commits[0]?.files.find((file: (typeof files)[number]) => file.path === "src/utils/supabase/server.ts")?.content ?? "";
    expect(client).toContain('from "@/app/actions/secure-query"');
    expect(client).not.toContain('supabase.from("jobs")');
    expect(action).toContain('"use server";');
    expect(action).toContain("supabase.auth.getUser()");
    expect(action).toContain("return { data, error };");
    expect(action).toContain("try {");
    expect(action).toContain("} catch (error) {");
    expect(action).toContain('from "@/utils/supabase/server"');
    expect(helper).toContain("export async function createClient()");
    expect(helper).toContain("@supabase/ssr");
    expect(recorded.comments[0]).toContain("CLIENT_DB_EXPOSURE");
    expect(recorded.comments[0]).toContain("Validation passed");
    expect(recorded.comments[0]).not.toContain("Partial heal");
    expect(recorded.comments[0]).not.toContain("sk_live_");

    // Healed action must not still trip Missing Error Handling when rescanned alone.
    const { missingErrorHandlingViolations } = await import("@/lib/firewall-error-handling");
    expect(missingErrorHandlingViolations("src/app/actions/secure-query.ts", action)).toEqual([]);
  });

  it("does not commit again when the head commit is already an autonomous heal", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
    const content = `"use client";\nexport async function load() {\n  return supabase.from("jobs").select("*");\n}\n`;
    const recorded = recordingClient(
      {
        filename: "src/components/jobs.tsx",
        status: "added",
        sha: "ffffffffffffffffffffffffffffffffffffffff",
        patch: "@@ -0,0 +1,4 @@\n+\"use client\";\n+export async function load() {\n+  return supabase.from(\"jobs\").select(\"*\");\n+}\n",
        content,
      },
      `${HEAL_COMMIT_PREFIX} previous`
    );
    const response = await handleSigned(delivery(), recorded.gate);
    expect(response.status).toBe(200);
    expect(recorded.commits).toEqual([]);
    expect(recorded.comments[0]).toContain("1 leak");
  });

  it("ignores a secret that the diff did not change", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
    const content = `const key = "${FAKE_STRIPE_LIVE_KEY}";\nexport const label = "billing";\n`;
    const recorded = recordingClient({
      filename: "src/lib/billing.ts",
      status: "modified",
      sha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      patch: `@@ -1,2 +1,2 @@\n const key = "${FAKE_STRIPE_LIVE_KEY}";\n-export const label = "checkout";\n+export const label = "billing";\n`,
      content,
    });
    const response = await handleSigned(delivery(), recorded.gate);
    expect(response.status).toBe(200);
    expect(recorded.statuses[0]?.payload.state).toBe("success");
    expect(recorded.statuses[0]?.payload.description).toBe("0 leaks, 0 violations. Ready to merge.");
    expect(recorded.comments).toEqual([]);
    expect(recorded.commits).toEqual([]);
  });
});
