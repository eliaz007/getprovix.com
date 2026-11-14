import { beforeEach, describe, expect, it, vi } from "vitest";

const PINNED = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TREE = "cccccccccccccccccccccccccccccccccccccccc";
const NEW_COMMIT = "dddddddddddddddddddddddddddddddddddddddd";

const stripe = `sk_live_${"b".repeat(24)}`;
const secretSource = `export const key = "${stripe}";\n`;
const secretPath = "src/lib/pay.ts";
const FINDING_ID = "m1:secret:src/lib/pay.ts:1";

const octokitMocks = {
  repos: {
    get: vi.fn(),
    getContent: vi.fn(),
  },
  git: {
    getRef: vi.fn(),
    getCommit: vi.fn(),
    createTree: vi.fn(),
    createCommit: vi.fn(),
    createRef: vi.fn(),
    deleteRef: vi.fn(),
  },
  pulls: {
    create: vi.fn(),
  },
};

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(function Octokit() {
    return { rest: octokitMocks };
  }),
}));

vi.mock("@/lib/autofix-tsc-preflight", () => ({
  AutofixTscPreflightError: class AutofixTscPreflightError extends Error {},
  assertAutofixTscPreflightPasses: vi.fn(async () => ({
    mode: "full" as const,
    stubCount: 0,
  })),
  preflightPullRequestSection: () => "### Preflight\n`tsc --noEmit` passed.",
}));

vi.mock("@/lib/github-base-ci-gate", () => ({
  assertBaseBranchReadyForAutofix: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("@/lib/firewall-open-prs", () => ({
  recordOpenAutofixPullRequest: vi.fn(async () => undefined),
}));

vi.mock("@/lib/github-source-file", async () => {
  const actual = await vi.importActual<typeof import("@/lib/github-source-file")>(
    "@/lib/github-source-file"
  );
  return {
    ...actual,
    readGitHubTextFile: vi.fn(),
    readGitHubSourceFile: vi.fn(),
  };
});

vi.mock("@/lib/post-fix-security-verify", async () => {
  const actual = await vi.importActual<typeof import("@/lib/post-fix-security-verify")>(
    "@/lib/post-fix-security-verify"
  );
  return {
    ...actual,
    verifySecurityFixResolved: vi.fn(actual.verifySecurityFixResolved),
    captureOriginalSecurityFinding: vi.fn(actual.captureOriginalSecurityFinding),
  };
});

vi.mock("@/lib/pvim/pvim-post-fix-verify", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pvim/pvim-post-fix-verify")>(
    "@/lib/pvim/pvim-post-fix-verify"
  );
  return {
    ...actual,
    verifyPvimFixResolved: vi.fn(actual.verifyPvimFixResolved),
  };
});

import { openSecurityFixPullRequest } from "@/lib/github-autofix-pr";
import { readGitHubTextFile } from "@/lib/github-source-file";
import { verifySecurityFixResolved } from "@/lib/post-fix-security-verify";
import { verifyPvimFixResolved } from "@/lib/pvim/pvim-post-fix-verify";

function resetOctokit() {
  for (const group of Object.values(octokitMocks)) {
    for (const fn of Object.values(group)) {
      fn.mockReset();
    }
  }
}

function mockHappyGitHubWrites(headSha: string) {
  octokitMocks.repos.get.mockResolvedValue({ data: { default_branch: "main" } });
  octokitMocks.git.getRef.mockResolvedValue({ data: { object: { sha: headSha } } });
  octokitMocks.git.getCommit.mockImplementation(async ({ commit_sha }: { commit_sha: string }) => ({
    data: {
      sha: commit_sha.length >= 40 ? commit_sha : headSha,
      tree: { sha: TREE },
    },
  }));
  octokitMocks.git.createTree.mockResolvedValue({ data: { sha: "tree-out" } });
  octokitMocks.git.createCommit.mockResolvedValue({ data: { sha: NEW_COMMIT } });
  octokitMocks.git.createRef.mockResolvedValue({ data: {} });
  octokitMocks.pulls.create.mockResolvedValue({
    data: {
      number: 42,
      html_url: "https://github.com/acme/app/pull/42",
      title: "fix: remove hardcoded secret from src/lib/pay.ts",
    },
  });
}

function mockSecretReads() {
  vi.mocked(readGitHubTextFile).mockImplementation(async (_repo, path) => {
    if (path === secretPath) return { ok: true as const, content: secretSource };
    if (path === ".env.example") return { ok: true as const, content: "" };
    return { ok: false as const, status: 404, message: "missing" };
  });
}

describe("openSecurityFixPullRequest PVIM post-fix verification", () => {
  beforeEach(() => {
    resetOctokit();
    vi.mocked(readGitHubTextFile).mockReset();
    vi.mocked(verifySecurityFixResolved).mockReset();
    vi.mocked(verifyPvimFixResolved).mockReset();
    vi.mocked(verifySecurityFixResolved).mockReturnValue({ ok: true });
    vi.mocked(verifyPvimFixResolved).mockResolvedValue({ ok: true });
    mockSecretReads();
    mockHappyGitHubWrites(PINNED);
  });

  it("runs Provix verification and then PVIM verification for PVIM-originated fixes", async () => {
    const order: string[] = [];
    vi.mocked(verifySecurityFixResolved).mockImplementation(() => {
      order.push("provix");
      return { ok: true };
    });
    vi.mocked(verifyPvimFixResolved).mockImplementation(async () => {
      order.push("pvim");
      return { ok: true };
    });

    const result = await openSecurityFixPullRequest("acme/app", secretPath, 1, "SECRET_LEAK", {
      token: "tok",
      commitSha: PINNED,
      pvim: {
        findingId: FINDING_ID,
        ruleId: "secrets_stripe_live",
        filePath: secretPath,
        commitSha: PINNED,
      },
    });

    expect(result.status).toBe(201);
    expect(verifySecurityFixResolved).toHaveBeenCalled();
    expect(verifyPvimFixResolved).toHaveBeenCalledWith(
      {
        findingId: FINDING_ID,
        ruleId: "secrets_stripe_live",
        filePath: secretPath,
        commitSha: PINNED,
      },
      expect.arrayContaining([expect.objectContaining({ path: secretPath })]),
      expect.any(Object)
    );
    expect(order).toEqual(["provix", "pvim"]);
    expect(octokitMocks.pulls.create).toHaveBeenCalled();
  });

  it("does not skip Provix verification when PVIM verification is attached", async () => {
    vi.mocked(verifySecurityFixResolved).mockReturnValue({
      ok: false,
      reason: "still-present",
      message:
        "Post-fix security verification failed: the original SECRET_LEAK finding is still present in the proposed patch (src/lib/pay.ts:1). The pull request was not opened.",
    });

    const result = await openSecurityFixPullRequest("acme/app", secretPath, 1, "SECRET_LEAK", {
      token: "tok",
      commitSha: PINNED,
      pvim: {
        findingId: FINDING_ID,
        ruleId: "secrets_stripe_live",
        filePath: secretPath,
      },
    });

    expect(result.status).toBe(422);
    expect(result.body.message).toMatch(/SECRET_LEAK/i);
    expect(verifySecurityFixResolved).toHaveBeenCalled();
    expect(verifyPvimFixResolved).not.toHaveBeenCalled();
    expect(octokitMocks.pulls.create).not.toHaveBeenCalled();
  });

  it("aborts PR creation when PVIM verification fails after Provix passes", async () => {
    vi.mocked(verifyPvimFixResolved).mockResolvedValue({
      ok: false,
      reason: "still-present",
      message:
        'Post-fix PVIM verification failed: the original finding_id "m1:secret:src/lib/pay.ts:1" (rule secrets_stripe_live) is still present in the proposed patch (src/lib/pay.ts:1). The pull request was not opened.',
    });

    const result = await openSecurityFixPullRequest("acme/app", secretPath, 1, "SECRET_LEAK", {
      token: "tok",
      commitSha: PINNED,
      pvim: {
        findingId: FINDING_ID,
        ruleId: "secrets_stripe_live",
        filePath: secretPath,
      },
    });

    expect(result.status).toBe(422);
    expect(result.body.message).toMatch(/finding_id/i);
    expect(verifySecurityFixResolved).toHaveBeenCalled();
    expect(verifyPvimFixResolved).toHaveBeenCalled();
    expect(octokitMocks.repos.get).not.toHaveBeenCalled();
    expect(octokitMocks.pulls.create).not.toHaveBeenCalled();
  });

  it("does not invoke PVIM verification for ordinary security fixes", async () => {
    const result = await openSecurityFixPullRequest("acme/app", secretPath, 1, "SECRET_LEAK", {
      token: "tok",
      commitSha: PINNED,
    });

    expect(result.status).toBe(201);
    expect(verifySecurityFixResolved).toHaveBeenCalled();
    expect(verifyPvimFixResolved).not.toHaveBeenCalled();
  });
});
