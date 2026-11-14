import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/api-auth", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/firewall-repo-access", () => ({
  authorizeFirewallRepoAccess: vi.fn(),
  readProvidedGithubToken: vi.fn((value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null
  ),
}));

vi.mock("@/lib/firewall-open-prs", () => ({
  listOpenAutofixPulls: vi.fn(async () => []),
}));

vi.mock("@/lib/github-app-client", () => ({
  resolveGithubRepoAccessToken: vi.fn(async () => ({
    ok: false as const,
    status: 403,
    message: "no app",
  })),
}));

vi.mock("@/lib/github-autofix-pr", () => ({
  openAutofixPullRequest: vi.fn(),
  openSecurityFixPullRequest: vi.fn(),
}));

vi.mock("@/lib/pvim/pvim-remediation-pr", () => ({
  openPvimRemediationPullRequest: vi.fn(),
}));

import { requireApiUser } from "@/lib/api-auth";
import { authorizeFirewallRepoAccess } from "@/lib/firewall-repo-access";
import { openSecurityFixPullRequest } from "@/lib/github-autofix-pr";
import { openPvimRemediationPullRequest } from "@/lib/pvim/pvim-remediation-pr";
import { POST } from "@/app/api/firewall/autofix/pr/route";

const PIN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function jsonRequest(body: unknown) {
  return new Request("https://getprovix.com/api/firewall/autofix/pr", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/firewall/autofix/pr PVIM integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireApiUser).mockResolvedValue({
      user: { id: "user-1" },
      supabase: {},
    } as never);
    vi.mocked(authorizeFirewallRepoAccess).mockResolvedValue({
      ok: true,
      token: "repo-token",
      source: "github_app",
    } as never);
  });

  it("rejects pvimFinding without commitSha", async () => {
    const response = await POST(
      jsonRequest({
        kind: "security",
        repoUrl: "acme/app",
        filePath: "src/lib/pay.ts",
        pvimFinding: {
          finding_id: "m1:secret:1",
          source: "m1",
          label: "secret_hardcoded",
          rule_id: "secrets_stripe_live",
          confidence: "confirmed",
          path: "src/lib/pay.ts",
          start_line: 1,
        },
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      message: expect.stringMatching(/commitSha is required/i),
    });
    expect(openPvimRemediationPullRequest).not.toHaveBeenCalled();
    expect(openSecurityFixPullRequest).not.toHaveBeenCalled();
  });

  it("routes supported PVIM findings through openPvimRemediationPullRequest", async () => {
    vi.mocked(openPvimRemediationPullRequest).mockResolvedValue({
      ok: true,
      status: 201,
      body: { ok: true, message: "Opened pull request #3.", number: 3 },
    });

    const response = await POST(
      jsonRequest({
        kind: "security",
        repoUrl: "acme/app",
        filePath: "src/lib/pay.ts",
        commitSha: PIN,
        pvimFinding: {
          finding_id: "m1:secret:1",
          source: "m1",
          label: "secret_hardcoded",
          rule_id: "secrets_stripe_live",
          confidence: "confirmed",
          path: "src/lib/pay.ts",
          start_line: 1,
        },
      })
    );

    expect(response.status).toBe(201);
    expect(openPvimRemediationPullRequest).toHaveBeenCalledWith(
      "acme/app",
      expect.objectContaining({
        finding_id: "m1:secret:1",
        label: "secret_hardcoded",
      }),
      expect.objectContaining({ token: "repo-token", commitSha: PIN })
    );
    expect(openSecurityFixPullRequest).not.toHaveBeenCalled();
  });

  it("returns unsupported PVIM adapter failures without opening a security PR", async () => {
    vi.mocked(openPvimRemediationPullRequest).mockResolvedValue({
      ok: false,
      status: 422,
      code: "unsupported_label",
      message: "Authorization findings are not autofixable in Provix today.",
      body: {
        ok: false,
        code: "unsupported_label",
        message: "Authorization findings are not autofixable in Provix today.",
      },
    });

    const response = await POST(
      jsonRequest({
        kind: "security",
        repoUrl: "acme/app",
        commitSha: PIN,
        pvimFinding: {
          finding_id: "m2:authz:1",
          source: "m2",
          label: "authorization_flaw",
          rule_id: "m2_p1_request_controlled_owner",
          confidence: "confirmed",
          path: "src/app/api/x/route.ts",
          start_line: 4,
        },
      })
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "unsupported_label",
    });
    expect(openSecurityFixPullRequest).not.toHaveBeenCalled();
  });

  it("keeps existing non-PVIM security requests working", async () => {
    vi.mocked(openSecurityFixPullRequest).mockResolvedValue({
      status: 201,
      body: { ok: true, message: "Opened pull request #4.", number: 4 },
    });

    const response = await POST(
      jsonRequest({
        kind: "security",
        repoUrl: "acme/app",
        filePath: "src/lib/pay.ts",
        line: 1,
        category: "SECRET_LEAK",
        commitSha: PIN,
      })
    );

    expect(response.status).toBe(201);
    expect(openPvimRemediationPullRequest).not.toHaveBeenCalled();
    expect(openSecurityFixPullRequest).toHaveBeenCalledWith(
      "acme/app",
      "src/lib/pay.ts",
      1,
      "SECRET_LEAK",
      expect.objectContaining({ token: "repo-token", commitSha: PIN })
    );
  });

  it("returns authorization failures before any remediation call", async () => {
    vi.mocked(authorizeFirewallRepoAccess).mockResolvedValue({
      ok: false,
      status: 403,
      message: "Install the Provix GitHub App on this repository.",
    } as never);

    const response = await POST(
      jsonRequest({
        kind: "security",
        repoUrl: "acme/app",
        filePath: "src/lib/pay.ts",
        line: 1,
        category: "SECRET_LEAK",
        commitSha: PIN,
        pvimFinding: {
          finding_id: "m1:secret:1",
          source: "m1",
          label: "secret_hardcoded",
          rule_id: "secrets_stripe_live",
          confidence: "confirmed",
          path: "src/lib/pay.ts",
          start_line: 1,
        },
      })
    );

    expect(response.status).toBe(403);
    expect(openPvimRemediationPullRequest).not.toHaveBeenCalled();
    expect(openSecurityFixPullRequest).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers before GitHub work", async () => {
    vi.mocked(requireApiUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await POST(
      jsonRequest({
        kind: "security",
        repoUrl: "acme/app",
        filePath: "src/lib/pay.ts",
        line: 1,
        category: "SECRET_LEAK",
      })
    );

    expect(response.status).toBe(401);
    expect(authorizeFirewallRepoAccess).not.toHaveBeenCalled();
    expect(openPvimRemediationPullRequest).not.toHaveBeenCalled();
    expect(openSecurityFixPullRequest).not.toHaveBeenCalled();
  });
});
