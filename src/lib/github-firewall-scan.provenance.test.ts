import { beforeEach, describe, expect, it, vi } from "vitest";

const PIN = "abcdef0123456789abcdef0123456789abcdef01";
const TREE = "1111111111111111111111111111111111111111";
const BLOB = "2222222222222222222222222222222222222222";

const octokitMocks = {
  repos: { get: vi.fn() },
  git: {
    getRef: vi.fn(),
    getTree: vi.fn(),
    getBlob: vi.fn(),
  },
};

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(function Octokit() {
    return { rest: octokitMocks };
  }),
}));

vi.mock("@/lib/honest-fix-gate", () => ({
  applyHonestFixGate: vi.fn(async (violations: unknown) => violations),
}));

vi.mock("../../scripts/ingest-engine", () => ({
  analyzeSourceTexts: vi.fn(() => ({
    timestamp: "2026-11-07T12:00:00.000Z",
    architectureScore: 77,
    summary: {
      totalFiles: 1,
      totalLines: 3,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    },
    violations: [],
    files: [
      {
        filePath: "src/lib/hello.ts",
        extension: ".ts",
        lineCount: 3,
        charCount: 40,
        imports: [],
      },
    ],
  })),
}));

import { scanPublicGitHubRepo } from "@/lib/github-firewall-scan";

describe("scanPublicGitHubRepo commit pinning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    octokitMocks.repos.get.mockResolvedValue({ data: { default_branch: "main" } });
    octokitMocks.git.getRef.mockResolvedValue({ data: { object: { sha: PIN } } });
    octokitMocks.git.getTree.mockResolvedValue({
      data: {
        truncated: false,
        tree: [
          {
            type: "blob",
            path: "src/lib/hello.ts",
            sha: BLOB,
            size: 40,
          },
        ],
      },
    });
    octokitMocks.git.getBlob.mockResolvedValue({
      data: {
        content: Buffer.from('export const hello = "world";\n').toString("base64"),
        encoding: "base64",
      },
    });
  });

  it("writes the exact getRef SHA into FirewallReport.commitSha and uses it for the tree", async () => {
    const result = await scanPublicGitHubRepo("acme/app", "tok");
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.report?.commitSha).toBe(PIN);
    expect(result.body.report?.pvim).toBeUndefined();
    expect(result.body.report?.pvimFindings).toBeUndefined();

    expect(octokitMocks.git.getTree).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "app",
        tree_sha: PIN,
        recursive: "true",
      })
    );
    // SHA is captured once from getRef — no second tip lookup.
    expect(octokitMocks.git.getRef).toHaveBeenCalledTimes(1);
    void TREE;
  });
});
