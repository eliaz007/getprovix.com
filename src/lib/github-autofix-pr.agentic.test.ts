import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agentic-fix-with-retry", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agentic-fix-with-retry")>(
    "@/lib/agentic-fix-with-retry"
  );
  return {
    ...actual,
    agenticFixWithRetry: vi.fn(),
  };
});

vi.mock("@/lib/github-source-file", async () => {
  const actual = await vi.importActual<typeof import("@/lib/github-source-file")>("@/lib/github-source-file");
  return {
    ...actual,
    readGitHubTextFile: vi.fn(),
  };
});

import { agenticFixWithRetry } from "@/lib/agentic-fix-with-retry";
import { openSecurityFixPullRequest } from "@/lib/github-autofix-pr";
import { readGitHubTextFile } from "@/lib/github-source-file";

const uncovered = `"use client";
export async function load(id: string) {
  return supabase.from("profiles").select("*").or(\`id.eq.\${id}\`);
}
`;

const plain = `"use client";
export const label = "ok";
`;

describe("openSecurityFixPullRequest agentic fallback", () => {
  afterEach(() => {
    delete process.env.PROVIX_AGENTIC_CLIENT_DB;
    vi.mocked(agenticFixWithRetry).mockReset();
    vi.mocked(readGitHubTextFile).mockReset();
  });

  it("does not call the agent when the flag is unset", async () => {
    vi.mocked(readGitHubTextFile).mockImplementation(async (_repo, filePath) => {
      if (filePath === "src/components/plain.tsx") return { ok: true, content: plain };
      return { ok: false, status: 404, message: "missing" };
    });

    const result = await openSecurityFixPullRequest(
      "eliaz007/getprovix.com",
      "src/components/plain.tsx",
      1,
      "CLIENT_DB_EXPOSURE",
      { token: "test-token" }
    );

    expect(agenticFixWithRetry).not.toHaveBeenCalled();
    expect(result.status).toBe(422);
    expect(result.body.ok).toBe(false);
    expect(result.body.message).toMatch(/no safe security fix/i);
  });

  it("fails quietly as manual review when the agent cannot fix an uncovered query", async () => {
    process.env.PROVIX_AGENTIC_CLIENT_DB = "1";
    vi.mocked(agenticFixWithRetry).mockResolvedValue({
      ok: false,
      message: "No fix produced after 3 attempts.",
      attempts: 3,
    });
    vi.mocked(readGitHubTextFile).mockImplementation(async (_repo, filePath) => {
      if (filePath === "src/components/profiles.tsx") return { ok: true, content: uncovered };
      return { ok: false, status: 404, message: "missing" };
    });

    const result = await openSecurityFixPullRequest(
      "eliaz007/getprovix.com",
      "src/components/profiles.tsx",
      3,
      "CLIENT_DB_EXPOSURE",
      { token: "test-token", snippet: 'supabase.from("profiles")' }
    );

    expect(agenticFixWithRetry).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(422);
    expect(result.body).toEqual({
      ok: false,
      message: "This finding stays on manual review. No pull request was opened.",
    });
  });
});
