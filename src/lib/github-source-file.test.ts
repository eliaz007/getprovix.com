import { beforeEach, describe, expect, it, vi } from "vitest";

const getContent = vi.fn();

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(function Octokit() {
    return {
      rest: {
        repos: { getContent },
      },
    };
  }),
}));

vi.mock("@/lib/github-app-client", () => ({
  resolveGithubRepoReadToken: vi.fn(async () => ({ token: "read-tok" })),
}));

import { readGitHubSourceFile, readGitHubTextFile } from "@/lib/github-source-file";

describe("readGitHubTextFile ref support", () => {
  beforeEach(() => {
    getContent.mockReset();
    getContent.mockResolvedValue({
      data: {
        type: "file",
        encoding: "utf8",
        content: "export const ok = true;\n",
        sha: "blobsha1",
      },
    });
  });

  it("forwards an optional ref to repos.getContent", async () => {
    const pin = "abcdef0123456789abcdef0123456789abcdef01";
    const result = await readGitHubTextFile("acme/app", "src/lib/pay.ts", {
      auth: "tok",
      ref: pin,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.blobSha).toBe("blobsha1");
    expect(getContent).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      path: "src/lib/pay.ts",
      ref: pin,
    });
  });

  it("omits ref when none is supplied", async () => {
    await readGitHubTextFile("acme/app", "src/lib/pay.ts", { auth: "tok" });
    expect(getContent).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      path: "src/lib/pay.ts",
    });
  });

  it("delegates ref through readGitHubSourceFile", async () => {
    const pin = "1234567";
    await readGitHubSourceFile("acme/app", "src/lib/pay.ts", "tok", pin);
    expect(getContent).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "src/lib/pay.ts",
        ref: pin,
      })
    );
  });
});
