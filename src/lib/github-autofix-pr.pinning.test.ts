import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PINNED = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MOVED = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TREE = "cccccccccccccccccccccccccccccccccccccccc";
const NEW_COMMIT = "dddddddddddddddddddddddddddddddddddddddd";

const stripe = `sk_live_${"b".repeat(24)}`;
const secretSource = `export const key = "${stripe}";\n`;
const secretPath = "src/lib/pay.ts";

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
    return {
      rest: octokitMocks,
    };
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

const verifyActual = await vi.importActual<typeof import("@/lib/post-fix-security-verify")>(
  "@/lib/post-fix-security-verify"
);

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

import { assertAutofixTscPreflightPasses } from "@/lib/autofix-tsc-preflight";
import {
  normalizeCommitSha,
  openAutofixPullRequest,
  openSecurityFixPullRequest,
  pinnedBaseMismatchMessage,
} from "@/lib/github-autofix-pr";
import { readGitHubSourceFile, readGitHubTextFile } from "@/lib/github-source-file";
import {
  captureOriginalSecurityFinding,
  verifySecurityFixResolved,
} from "@/lib/post-fix-security-verify";

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

describe("normalizeCommitSha", () => {
  it("accepts full and abbreviated hex SHAs", () => {
    expect(normalizeCommitSha(PINNED)).toBe(PINNED);
    expect(normalizeCommitSha("AbcDef1")).toBe("abcdef1");
    expect(normalizeCommitSha(`  ${PINNED}  `)).toBe(PINNED);
  });

  it("rejects invalid values", () => {
    expect(normalizeCommitSha("")).toBeNull();
    expect(normalizeCommitSha("not-a-sha")).toBeNull();
    expect(normalizeCommitSha("ggggggg")).toBeNull();
    expect(normalizeCommitSha("abc")).toBeNull();
    expect(normalizeCommitSha(null)).toBeNull();
    expect(normalizeCommitSha(12)).toBeNull();
  });
});

describe("openSecurityFixPullRequest commit pinning", () => {
  beforeEach(() => {
    resetOctokit();
    vi.mocked(readGitHubTextFile).mockReset();
    vi.mocked(readGitHubSourceFile).mockReset();
    vi.mocked(verifySecurityFixResolved).mockReset();
    vi.mocked(captureOriginalSecurityFinding).mockReset();
    vi.mocked(assertAutofixTscPreflightPasses).mockClear();
    vi.mocked(verifySecurityFixResolved).mockImplementation(
      verifyActual.verifySecurityFixResolved
    );
    vi.mocked(captureOriginalSecurityFinding).mockImplementation(
      verifyActual.captureOriginalSecurityFinding
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function mockSecretReads() {
    vi.mocked(readGitHubTextFile).mockImplementation(async (_repo, filePath) => {
      if (filePath === secretPath) {
        return { ok: true as const, content: secretSource };
      }
      if (filePath === ".env.example") {
        return { ok: false as const, status: 404, message: "missing" };
      }
      return { ok: false as const, status: 404, message: "missing" };
    });
  }

  it("rejects invalid commitSha before GitHub writes", async () => {
    mockSecretReads();
    const result = await openSecurityFixPullRequest("acme/app", secretPath, 1, "SECRET_LEAK", {
      token: "tok",
      commitSha: "not-a-valid-sha!!!",
    });
    expect(result.status).toBe(400);
    expect(result.body.ok).toBe(false);
    expect(result.body.message).toMatch(/commitSha must be a Git SHA/i);
    expect(readGitHubTextFile).not.toHaveBeenCalled();
    expect(octokitMocks.git.createTree).not.toHaveBeenCalled();
    expect(octokitMocks.git.createCommit).not.toHaveBeenCalled();
    expect(octokitMocks.git.createRef).not.toHaveBeenCalled();
    expect(octokitMocks.pulls.create).not.toHaveBeenCalled();
  });

  it("passes the pinned ref on every security source read", async () => {
    mockSecretReads();
    mockHappyGitHubWrites(PINNED);
    vi.mocked(verifySecurityFixResolved).mockReturnValue({ ok: true });

    const result = await openSecurityFixPullRequest("acme/app", secretPath, 1, "SECRET_LEAK", {
      token: "tok",
      commitSha: PINNED,
      snippet: stripe,
    });

    expect(result.status).toBe(201);
    expect(result.body.ok).toBe(true);

    const readCalls = vi.mocked(readGitHubTextFile).mock.calls;
    expect(readCalls.length).toBeGreaterThan(0);
    for (const call of readCalls) {
      const options = call[2] as { ref?: string; auth?: string } | undefined;
      expect(options?.ref).toBe(PINNED);
      expect(options?.auth).toBe("tok");
    }
  });

  it("proceeds when the pinned SHA matches default-branch HEAD", async () => {
    mockSecretReads();
    mockHappyGitHubWrites(PINNED);
    vi.mocked(verifySecurityFixResolved).mockReturnValue({ ok: true });

    const result = await openSecurityFixPullRequest("acme/app", secretPath, 1, "SECRET_LEAK", {
      token: "tok",
      commitSha: PINNED,
    });

    expect(result.status).toBe(201);
    expect(octokitMocks.git.createTree).toHaveBeenCalledTimes(1);
    expect(octokitMocks.git.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ parents: [PINNED] })
    );
    expect(octokitMocks.git.createRef).toHaveBeenCalledTimes(1);
    expect(octokitMocks.pulls.create).toHaveBeenCalledTimes(1);
  });

  it("returns 409 and never writes when the default branch moved", async () => {
    mockSecretReads();
    mockHappyGitHubWrites(MOVED);
    // Pin resolve returns PINNED; HEAD is MOVED.
    octokitMocks.git.getCommit.mockImplementation(async ({ commit_sha }: { commit_sha: string }) => {
      if (commit_sha === PINNED) {
        return { data: { sha: PINNED, tree: { sha: TREE } } };
      }
      return { data: { sha: commit_sha, tree: { sha: TREE } } };
    });
    vi.mocked(verifySecurityFixResolved).mockReturnValue({ ok: true });

    const result = await openSecurityFixPullRequest("acme/app", secretPath, 1, "SECRET_LEAK", {
      token: "tok",
      commitSha: PINNED,
    });

    expect(result.status).toBe(409);
    expect(result.body.ok).toBe(false);
    expect(result.body.message).toBe(pinnedBaseMismatchMessage("main", PINNED, MOVED));
    expect(octokitMocks.git.createTree).not.toHaveBeenCalled();
    expect(octokitMocks.git.createCommit).not.toHaveBeenCalled();
    expect(octokitMocks.git.createRef).not.toHaveBeenCalled();
    expect(octokitMocks.pulls.create).not.toHaveBeenCalled();
  });

  it("blocks PR creation when post-fix verification finds a residual", async () => {
    mockSecretReads();
    mockHappyGitHubWrites(PINNED);
    vi.mocked(verifySecurityFixResolved).mockReturnValue({
      ok: false,
      reason: "still-present",
      message:
        "Post-fix security verification failed: the original SECRET_LEAK finding is still present in the proposed patch (src/lib/pay.ts:1). The pull request was not opened.",
    });

    const result = await openSecurityFixPullRequest("acme/app", secretPath, 1, "SECRET_LEAK", {
      token: "tok",
      commitSha: PINNED,
    });

    expect(result.status).toBe(422);
    expect(result.body.ok).toBe(false);
    expect(result.body.message).toMatch(/still present/i);
    expect(octokitMocks.repos.get).not.toHaveBeenCalled();
    expect(octokitMocks.git.createTree).not.toHaveBeenCalled();
    expect(octokitMocks.git.createCommit).not.toHaveBeenCalled();
    expect(octokitMocks.git.createRef).not.toHaveBeenCalled();
    expect(octokitMocks.pulls.create).not.toHaveBeenCalled();
  });

  it("allows the existing PR flow when verification passes", async () => {
    mockSecretReads();
    mockHappyGitHubWrites(PINNED);
    vi.mocked(verifySecurityFixResolved).mockReturnValue({ ok: true });

    const result = await openSecurityFixPullRequest("acme/app", secretPath, 1, "SECRET_LEAK", {
      token: "tok",
      commitSha: PINNED,
    });

    expect(verifySecurityFixResolved).toHaveBeenCalled();
    expect(captureOriginalSecurityFinding).toHaveBeenCalled();
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      ok: true,
      number: 42,
      url: "https://github.com/acme/app/pull/42",
    });
  });

  it("runs verification after tsc preflight and before GitHub writes", async () => {
    mockSecretReads();
    mockHappyGitHubWrites(PINNED);
    const order: string[] = [];
    vi.mocked(assertAutofixTscPreflightPasses).mockImplementation(async () => {
      order.push("tsc");
      return { mode: "full", stubCount: 0 };
    });
    vi.mocked(verifySecurityFixResolved).mockImplementation(() => {
      order.push("verify");
      return { ok: true };
    });
    octokitMocks.repos.get.mockImplementation(async () => {
      order.push("github");
      return { data: { default_branch: "main" } };
    });

    await openSecurityFixPullRequest("acme/app", secretPath, 1, "SECRET_LEAK", {
      token: "tok",
      commitSha: PINNED,
    });

    expect(order.indexOf("tsc")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("verify")).toBeGreaterThan(order.indexOf("tsc"));
    expect(order.indexOf("github")).toBeGreaterThan(order.indexOf("verify"));
  });

  it("fails closed when verification cannot run (scan-failed)", async () => {
    mockSecretReads();
    mockHappyGitHubWrites(PINNED);
    vi.mocked(verifySecurityFixResolved).mockReturnValue({
      ok: false,
      reason: "scan-failed",
      message:
        "Post-fix security verification could not complete (scanner exploded). The pull request was not opened.",
    });

    const result = await openSecurityFixPullRequest("acme/app", secretPath, 1, "SECRET_LEAK", {
      token: "tok",
      commitSha: PINNED,
    });

    expect(result.status).toBe(422);
    expect(result.body.message).toMatch(/could not complete/i);
    expect(octokitMocks.git.createRef).not.toHaveBeenCalled();
    expect(octokitMocks.pulls.create).not.toHaveBeenCalled();
  });
});

describe("non-security autofix behavior unchanged without pin", () => {
  beforeEach(() => {
    resetOctokit();
    vi.mocked(readGitHubSourceFile).mockReset();
    vi.mocked(readGitHubTextFile).mockReset();
    vi.mocked(verifySecurityFixResolved).mockReset();
    vi.mocked(captureOriginalSecurityFinding).mockReset();
    vi.mocked(verifySecurityFixResolved).mockImplementation(
      verifyActual.verifySecurityFixResolved
    );
    vi.mocked(captureOriginalSecurityFinding).mockImplementation(
      verifyActual.captureOriginalSecurityFinding
    );
  });

  it("does not invoke post-fix verification for architecture autofix", async () => {
    vi.mocked(readGitHubSourceFile).mockResolvedValue({
      ok: true,
      content: "export const x = 1;\n",
    });

    const result = await openAutofixPullRequest("acme/app", "src/lib/plain.ts", "tok");
    expect(verifySecurityFixResolved).not.toHaveBeenCalled();
    expect(result.body.ok).toBe(false);
  });

  it("omits ref when security fix is opened without commitSha", async () => {
    vi.mocked(readGitHubTextFile).mockImplementation(async (_repo, filePath) => {
      if (filePath === secretPath) return { ok: true as const, content: secretSource };
      return { ok: false as const, status: 404, message: "missing" };
    });
    vi.mocked(verifySecurityFixResolved).mockReturnValue({ ok: true });
    mockHappyGitHubWrites(PINNED);

    const result = await openSecurityFixPullRequest("acme/app", secretPath, 1, "SECRET_LEAK", {
      token: "tok",
    });

    expect(result.status).toBe(201);
    for (const call of vi.mocked(readGitHubTextFile).mock.calls) {
      const options = call[2] as { ref?: string } | undefined;
      expect(options?.ref).toBeUndefined();
    }
    expect(octokitMocks.git.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ parents: [PINNED] })
    );
  });
});
