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

const SECRET = "webhook-test-secret";
/** Built at runtime so GitHub push protection does not flag a Stripe-shaped literal. */
const FAKE_STRIPE_LIVE_KEY = `sk_live_${"a".repeat(24)}`;

function signature(body: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
}

function delivery(action: "opened" | "synchronize" | "closed" = "opened") {
  return JSON.stringify({
    action,
    repository: { name: "getprovix.com", owner: { login: "eliaz007" } },
    pull_request: { number: 41, head: { sha: "abc123def4567890", ref: "provix/fix-login" } },
  });
}

function requestFor(body: string, header: string | null, event = "pull_request") {
  const headers = new Headers({ "content-type": "application/json", "x-github-event": event });
  if (header) headers.set("x-hub-signature-256", header);
  return new Request("http://localhost:3000/api/webhooks/github", { method: "POST", headers, body });
}

type ListedFile = {
  filename: string;
  status: string;
  sha: string;
  patch?: string | null;
  content: string;
};

function recordingClient(file: ListedFile, commitMessage = "") {
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

    const secretFix = gateFixForFinding({
      category: "SECRET_LEAK",
      rule: "Hardcoded Secret",
      remediation: { diff: "", envExample: "STRIPE_SECRET_KEY=" },
    });
    expect(secretFix).toContain("Rotate or revoke");
    expect(secretFix).toContain("Git history");
    expect(secretFix).toContain("does not rotate credentials or rewrite history");

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
          message:
            "Stripe live secret key is exposed in source. Replace the literal with process.env.STRIPE_SECRET_KEY. Moving the value into an environment variable does not invalidate the exposed credential.",
          fix: secretFix,
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
    expect(body).toContain("Stripe live secret key is exposed in source");
    expect(body).toContain("does not invalidate the exposed credential");
    expect(body).toContain("Fix: Rotate or revoke the exposed credential");
    expect(body).toContain("Fix: Move the query into a server action");
    expect(body).toContain("[Open Heal queue](https://provix.test/firewall?repo=acme%2Fdemo&view=violations)");
  });
});

describe("POST /api/webhooks/github", () => {
  const previousSecret = process.env.GITHUB_WEBHOOK_SECRET;
  const previousApp = process.env.NEXT_PUBLIC_APP_URL;
  const previousHeal = process.env.PROVIX_AUTONOMOUS_WEBHOOK_HEAL;

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.GITHUB_WEBHOOK_SECRET;
    else process.env.GITHUB_WEBHOOK_SECRET = previousSecret;
    if (previousApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousApp;
    if (previousHeal === undefined) delete process.env.PROVIX_AUTONOMOUS_WEBHOOK_HEAL;
    else process.env.PROVIX_AUTONOMOUS_WEBHOOK_HEAL = previousHeal;
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

  // Same class as the client-DB heal case below: autonomous heal runs real
  // finalizeAutofixWrites → tsc. Under a loaded full suite that exceeds Vitest's
  // default 5s; keep assertions intact and match the sibling budget.
  it(
    "fails the check and comments when a changed line leaks or violates a boundary",
    async () => {
      process.env.GITHUB_WEBHOOK_SECRET = SECRET;
      process.env.PROVIX_AUTONOMOUS_WEBHOOK_HEAL = "true";
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
      const body = (await response.json()) as {
        leaks: number;
        violations: number;
        description: string;
        state: string;
      };
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
      expect(recorded.commits[0]?.message.startsWith(`${HEAL_COMMIT_PREFIX} abc123def4567890`)).toBe(
        true
      );
      const patched =
        recorded.commits[0]?.files.find((file) => file.path === "src/components/billing.tsx")
          ?.content ?? "";
      const example =
        recorded.commits[0]?.files.find((file) => file.path === ".env.example")?.content ?? "";
      expect(patched).not.toContain("sk_live_");
      expect(patched).toContain("process.env.STRIPE_SECRET_KEY");
      expect(example).toContain("STRIPE_SECRET_KEY=");
      expect(recorded.comments).toHaveLength(1);
      expect(recorded.comments[0]).toContain("provix/autonomous-heal");
      expect(recorded.comments[0]).toContain("committed to provix/fix-login");
      expect(recorded.comments[0]).toContain("SECRET_LEAK");
      expect(recorded.comments[0]).toMatch(/Validation passed\.|Partial heal:/);
      expect(recorded.comments[0]).not.toContain("sk_live_");
    },
    15_000
  );

  it(
    "commits a validated server action when a client Supabase query changed",
    async () => {
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
    process.env.PROVIX_AUTONOMOUS_WEBHOOK_HEAL = "true";
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
    const client = recorded.commits[0]?.files.find((file) => file.path === "src/components/jobs.tsx")?.content ?? "";
    const action = recorded.commits[0]?.files.find((file) => file.path === "src/app/actions/secure-query.ts")?.content ?? "";
    const helper = recorded.commits[0]?.files.find((file) => file.path === "src/utils/supabase/server.ts")?.content ?? "";
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
  },
    15_000
  );

  it("does not commit again when the head commit is already an autonomous heal", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
    process.env.PROVIX_AUTONOMOUS_WEBHOOK_HEAL = "true";
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

  it("opens a provix/auto-heal PR from a signed default-branch push", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
    process.env.PROVIX_AUTONOMOUS_WEBHOOK_HEAL = "true";
    const content = `"use client";\nexport async function load() {\n  return supabase.from("jobs").select("*");\n}\n`;
    const pushBody = JSON.stringify({
      ref: "refs/heads/main",
      after: "abc123def4567890abcdef1234567890abcdef12",
      deleted: false,
      repository: {
        name: "getprovix.com",
        default_branch: "main",
        owner: { login: "eliaz007" },
      },
      head_commit: { id: "abc123def4567890abcdef1234567890abcdef12", message: "feat: jobs page" },
      commits: [
        {
          message: "feat: jobs page",
          added: ["src/components/jobs.tsx"],
          modified: [],
          removed: [],
        },
      ],
    });
    const files = new Map<string, string>([["src/components/jobs.tsx", content]]);
    const gate: GithubGateClient = {
      async listPullFiles() {
        return [];
      },
      async readFile() {
        return null;
      },
      async postStatus() {},
      async postComment() {},
      async readTextFile(input) {
        return files.get(input.path) ?? null;
      },
    };
    const opened: Array<{ repo: string; finding: { filePath: string; category: string }; branch?: string }> = [];
    const response = await handleGithubWebhook(requestFor(pushBody, signature(pushBody), "push"), gate, {
      resolveToken: async () => ({ ok: true, token: "test-token" }),
      openPullRequest: async (repo, finding) => {
        opened.push({ repo, finding: { filePath: finding.filePath, category: finding.category } });
        return {
          status: 201,
          body: {
            ok: true,
            message: "Opened pull request #99.",
            url: "https://github.com/eliaz007/getprovix.com/pull/99",
            number: 99,
            branch: "provix/auto-heal-client-query-src-components-jobs-abc",
            title: "fix: move client query",
            base: "main",
          },
        };
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      healed: true,
      autopilot: true,
      pullRequestNumber: 99,
      branch: "provix/auto-heal-client-query-src-components-jobs-abc",
    });
    expect(opened).toEqual([
      {
        repo: "eliaz007/getprovix.com",
        finding: { filePath: "src/components/jobs.tsx", category: "CLIENT_DB_EXPOSURE" },
      },
    ]);
  });

  it("ignores pushes to non-default branches so auto-heal PRs do not loop", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
    process.env.PROVIX_AUTONOMOUS_WEBHOOK_HEAL = "true";
    const pushBody = JSON.stringify({
      ref: "refs/heads/provix/auto-heal-secret-billing-xyz",
      after: "abc123def4567890abcdef1234567890abcdef12",
      repository: {
        name: "getprovix.com",
        default_branch: "main",
        owner: { login: "eliaz007" },
      },
      commits: [{ added: ["src/lib/billing.ts"], modified: [], removed: [] }],
    });
    const response = await handleGithubWebhook(
      requestFor(pushBody, signature(pushBody), "push"),
      recordingClient({
        filename: "src/lib/billing.ts",
        status: "added",
        sha: "f".repeat(40),
        content: "export {}",
      }).gate
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: true });
  });

  it("accepts a signed repository_dispatch audit trigger", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
    process.env.PROVIX_AUTONOMOUS_WEBHOOK_HEAL = "true";
    const content = `"use client";\nexport async function load() {\n  return supabase.from("jobs").select("*");\n}\n`;
    const auditBody = JSON.stringify({
      action: "provix-audit",
      repository: {
        name: "getprovix.com",
        default_branch: "main",
        owner: { login: "eliaz007" },
      },
      client_payload: {
        event: "provix-audit",
        sha: "abc123def4567890abcdef1234567890abcdef12",
        branch: "main",
        paths: ["src/components/jobs.tsx"],
      },
    });
    const gate: GithubGateClient = {
      async listPullFiles() {
        return [];
      },
      async readFile() {
        return null;
      },
      async postStatus() {},
      async postComment() {},
      async readTextFile() {
        return content;
      },
    };
    const response = await handleGithubWebhook(
      requestFor(auditBody, signature(auditBody), "repository_dispatch"),
      gate,
      {
        resolveToken: async () => ({ ok: true, token: "test-token" }),
        openPullRequest: async () => ({
          status: 201,
          body: {
            ok: true,
            message: "Opened",
            url: "https://github.com/eliaz007/getprovix.com/pull/7",
            number: 7,
            branch: "provix/auto-heal-client-query-jobs-1",
          },
        }),
      }
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      autopilot: true,
      pullRequestNumber: 7,
    });
  });
});

function handleSigned(body: string, gate: GithubGateClient) {
  return handleGithubWebhook(requestFor(body, signature(body)), gate);
}
