import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  contributionIsLow,
  githubCommitMatchesLinkedUsername,
  verifyGitHubRepoOwnership,
} from "./github-ownership";

const acmeUser = {
  identities: [
    {
      provider: "github",
      identity_data: { user_name: "Acme" },
    },
  ],
} as unknown as User;

function commit(login: string, sha: string) {
  return {
    sha,
    author: { login },
    commit: { author: { email: `${login.toLowerCase()}@users.noreply.github.com` } },
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mockCommitFetches(authored: unknown[], recent: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      return jsonResponse(href.includes("author=") ? authored : recent);
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyGitHubRepoOwnership", () => {
  it("verifies a direct owner match case-insensitively", async () => {
    const authored = [
      commit("Acme", "aaa"),
      commit("Acme", "bbb"),
      commit("Acme", "ccc"),
    ];
    mockCommitFetches(authored, authored);

    const result = await verifyGitHubRepoOwnership({
      user: acmeUser,
      repoUrl: "https://github.com/acme/widgets",
    });

    expect(result.verified).toBe(true);
    expect(result.method).toBe("owner");
    expect(result.username).toBe("Acme");
    expect(result.lowContributionWarning).toBe(false);
  });

  it("verifies an owner/repo namespace against the linked username", async () => {
    const authored = [
      commit("Acme", "aaa"),
      commit("Acme", "bbb"),
      commit("Acme", "ccc"),
    ];
    mockCommitFetches(authored, authored);

    const result = await verifyGitHubRepoOwnership({
      user: acmeUser,
      repoUrl: "acme/widgets",
    });

    expect(result.verified).toBe(true);
    expect(result.method).toBe("owner");
    expect(result.owner).toBe("acme");
    expect(result.lowContributionWarning).toBe(false);
  });

  it("clears the contribution warning when the applicant has 3 distinct commits", async () => {
    const authored = [
      commit("Acme", "aaa"),
      commit("Acme", "bbb"),
      commit("Acme", "ccc"),
    ];
    mockCommitFetches(authored, [commit("other", "ddd")]);

    const result = await verifyGitHubRepoOwnership({
      user: acmeUser,
      repoUrl: "https://github.com/acme/widgets",
    });

    expect(result.verified).toBe(true);
    expect(result.lowContributionWarning).toBe(false);
  });

  it("clears the contribution warning at 40% of recent history", async () => {
    const recent = [
      commit("Acme", "a1"),
      commit("Acme", "a2"),
      commit("other", "o1"),
      commit("other", "o2"),
      commit("other", "o3"),
    ];
    mockCommitFetches([commit("Acme", "a1")], recent);

    const result = await verifyGitHubRepoOwnership({
      user: acmeUser,
      repoUrl: "https://github.com/acme/widgets",
    });

    expect(result.verified).toBe(true);
    expect(result.lowContributionWarning).toBe(false);
  });

  it("warns when the owner has 1 of the last 20 commits", async () => {
    const recent = [
      commit("Acme", "a1"),
      ...Array.from({ length: 19 }, (_, index) =>
        commit("upstream", `u${index}`)
      ),
    ];
    mockCommitFetches([commit("Acme", "a1")], recent);

    const result = await verifyGitHubRepoOwnership({
      user: acmeUser,
      repoUrl: "https://github.com/acme/widgets",
    });

    expect(result.verified).toBe(true);
    expect(result.method).toBe("owner");
    expect(result.lowContributionWarning).toBe(true);
  });

  it("rejects claims without a GitHub identity", async () => {
    const result = await verifyGitHubRepoOwnership({
      user: { identities: [], user_metadata: {} } as unknown as User,
      repoUrl: "https://github.com/acme/widgets",
    });

    expect(result.verified).toBe(false);
    expect(result.method).toBeNull();
  });
});

describe("githubCommitMatchesLinkedUsername", () => {
  it("matches commit author login", () => {
    expect(
      githubCommitMatchesLinkedUsername(
        { author: { login: "OctoCat" }, commit: { author: { email: "other@example.com" } } },
        "octocat"
      )
    ).toBe(true);
  });

  it("falls back to commit author email when login is null", () => {
    expect(
      githubCommitMatchesLinkedUsername(
        {
          author: { login: null },
          commit: { author: { email: "12345+octocat@users.noreply.github.com" } },
        },
        "octocat"
      )
    ).toBe(true);
    expect(
      githubCommitMatchesLinkedUsername(
        {
          author: null,
          commit: { author: { email: "octocat@users.noreply.github.com" } },
        },
        "OctoCat"
      )
    ).toBe(true);
  });

  it("does not use email when a different login is present", () => {
    expect(
      githubCommitMatchesLinkedUsername(
        {
          author: { login: "someone-else" },
          commit: { author: { email: "octocat@users.noreply.github.com" } },
        },
        "octocat"
      )
    ).toBe(false);
  });
});

describe("contributionIsLow", () => {
  it("passes at 3 authored commits or 40% of recent history", () => {
    expect(
      contributionIsLow({ authoredDistinct: 3, recentCount: 20, recentAuthored: 1 })
    ).toBe(false);
    expect(
      contributionIsLow({ authoredDistinct: 1, recentCount: 5, recentAuthored: 2 })
    ).toBe(false);
  });

  it("warns below both bars", () => {
    expect(
      contributionIsLow({ authoredDistinct: 1, recentCount: 20, recentAuthored: 1 })
    ).toBe(true);
  });
});
