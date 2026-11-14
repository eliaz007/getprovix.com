import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/github-autofix-pr", async () => {
  const actual = await vi.importActual<typeof import("@/lib/github-autofix-pr")>(
    "@/lib/github-autofix-pr"
  );
  return {
    ...actual,
    openSecurityFixPullRequest: vi.fn(),
  };
});

vi.mock("@/lib/github-source-file", async () => {
  const actual = await vi.importActual<typeof import("@/lib/github-source-file")>(
    "@/lib/github-source-file"
  );
  return {
    ...actual,
    readGitHubTextFile: vi.fn(),
  };
});

import { openSecurityFixPullRequest } from "@/lib/github-autofix-pr";
import { readGitHubTextFile } from "@/lib/github-source-file";
import { openPvimRemediationPullRequest } from "@/lib/pvim/pvim-remediation-pr";
import type { PvimFindingLike } from "@/lib/pvim/pvim-remediation-adapter";

const PIN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const secretFinding: PvimFindingLike = {
  finding_id: "m1:secret:src/lib/pay.ts:1",
  source: "m1",
  family: "m1",
  label: "secret_hardcoded",
  rule_id: "secrets_stripe_live",
  confidence: "confirmed",
  path: "src/lib/pay.ts",
  start_line: 1,
  message: "Hardcoded secret",
};

describe("openPvimRemediationPullRequest", () => {
  beforeEach(() => {
    vi.mocked(openSecurityFixPullRequest).mockReset();
    vi.mocked(readGitHubTextFile).mockReset();
  });

  it("never calls openSecurityFixPullRequest for unsupported findings", async () => {
    vi.mocked(readGitHubTextFile).mockResolvedValue({
      ok: false,
      status: 404,
      message: "missing",
    });
    const result = await openPvimRemediationPullRequest(
      "acme/app",
      {
        ...secretFinding,
        label: "authorization_flaw",
        source: "m2",
        family: "p1",
        rule_id: "m2_p1_request_controlled_owner",
        path: "src/app/api/items/route.ts",
        start_line: 12,
      },
      { token: "tok", commitSha: PIN }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported_label");
      expect(result.status).toBe(422);
      expect(result.body).toMatchObject({ ok: false, code: "unsupported_label" });
    }
    expect(openSecurityFixPullRequest).not.toHaveBeenCalled();
  });

  it("forwards the exact commit SHA for supported findings", async () => {
    vi.mocked(openSecurityFixPullRequest).mockResolvedValue({
      status: 201,
      body: {
        ok: true,
        message: "Opened pull request #9.",
        number: 9,
        url: "https://github.com/acme/app/pull/9",
      },
    });

    const result = await openPvimRemediationPullRequest("acme/app", secretFinding, {
      token: "tok",
      commitSha: PIN,
      snippet: "sk_live_…",
      contentAtPath: () => 'export const key = "x";\n',
    });

    expect(result.ok).toBe(true);
    expect(openSecurityFixPullRequest).toHaveBeenCalledTimes(1);
    expect(openSecurityFixPullRequest).toHaveBeenCalledWith(
      "acme/app",
      "src/lib/pay.ts",
      1,
      "SECRET_LEAK",
      {
        token: "tok",
        commitSha: PIN,
        snippet: "sk_live_…",
        pvim: {
          findingId: "m1:secret:src/lib/pay.ts:1",
          ruleId: "secrets_stripe_live",
          filePath: "src/lib/pay.ts",
          commitSha: PIN,
        },
      }
    );
  });

  it("rejects invalid commitSha before any GitHub read or PR open", async () => {
    const result = await openPvimRemediationPullRequest("acme/app", secretFinding, {
      token: "tok",
      commitSha: "not-valid",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_commit_sha");
      expect(result.status).toBe(400);
    }
    expect(readGitHubTextFile).not.toHaveBeenCalled();
    expect(openSecurityFixPullRequest).not.toHaveBeenCalled();
  });

  it("reads pinned content for client supabase findings before adapting", async () => {
    vi.mocked(readGitHubTextFile).mockResolvedValue({
      ok: true,
      content: `"use client";\nexport async function load(){ return supabase.from("profiles"); }\n`,
    });
    vi.mocked(openSecurityFixPullRequest).mockResolvedValue({
      status: 201,
      body: { ok: true, message: "Opened pull request #2.", number: 2 },
    });

    const result = await openPvimRemediationPullRequest(
      "acme/app",
      {
        finding_id: "m1:supabase:1",
        source: "m1",
        family: "m1",
        label: "supabase_insecure_access",
        rule_id: "supabase_select_star_sensitive",
        confidence: "confirmed",
        path: "src/components/profiles.tsx",
        start_line: 3,
      },
      { token: "tok", commitSha: PIN }
    );

    expect(result.ok).toBe(true);
    expect(readGitHubTextFile).toHaveBeenCalledWith(
      "https://github.com/acme/app",
      "src/components/profiles.tsx",
      expect.objectContaining({ auth: "tok", ref: PIN })
    );
    expect(openSecurityFixPullRequest).toHaveBeenCalledWith(
      "acme/app",
      "src/components/profiles.tsx",
      3,
      "CLIENT_DB_EXPOSURE",
      expect.objectContaining({
        commitSha: PIN,
        pvim: expect.objectContaining({
          findingId: "m1:supabase:1",
          ruleId: "supabase_select_star_sensitive",
          filePath: "src/components/profiles.tsx",
          commitSha: PIN,
        }),
      })
    );
  });
});
