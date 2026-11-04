import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authorizeFirewallRepoAccess,
  partialScanLine,
  readProvidedGithubToken,
} from "@/lib/firewall-repo-access";

const ORIGINAL_APP_ID = process.env.GITHUB_APP_ID;
const ORIGINAL_APP_KEY = process.env.GITHUB_APP_PRIVATE_KEY;
const ORIGINAL_TOKEN = process.env.GITHUB_TOKEN;
const ORIGINAL_PAT = process.env.GITHUB_PAT;

const USER_PAT = "ghp_userTokenValue123456";
const SERVER_PAT = "ghp_serverTokenValue1234";

afterEach(() => {
  if (ORIGINAL_APP_ID === undefined) delete process.env.GITHUB_APP_ID;
  else process.env.GITHUB_APP_ID = ORIGINAL_APP_ID;
  if (ORIGINAL_APP_KEY === undefined) delete process.env.GITHUB_APP_PRIVATE_KEY;
  else process.env.GITHUB_APP_PRIVATE_KEY = ORIGINAL_APP_KEY;
  if (ORIGINAL_TOKEN === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = ORIGINAL_TOKEN;
  if (ORIGINAL_PAT === undefined) delete process.env.GITHUB_PAT;
  else process.env.GITHUB_PAT = ORIGINAL_PAT;
});

function supabaseFor(installed: string[]): SupabaseClient {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq(_column: string, fullName: string) {
                  return {
                    async maybeSingle() {
                      return {
                        data: installed.includes(fullName) ? { full_name: fullName } : null,
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("readProvidedGithubToken", () => {
  it("accepts a personal access token and ignores anything else", () => {
    expect(readProvidedGithubToken(`  ${USER_PAT}  `)).toBe(USER_PAT);
    expect(readProvidedGithubToken("github_pat_abcdefghijklmnopqrstuvwxyz")).toMatch(/^github_pat_/);
    expect(readProvidedGithubToken("not-a-token")).toBeNull();
    expect(readProvidedGithubToken(null)).toBeNull();
  });
});

describe("partialScanLine", () => {
  it("names the cap only when the tree or the file list was cut", () => {
    expect(partialScanLine({ scanned: 50, total: 180, treeTruncated: false })).toBe(
      "Scanned 50 of 180 source files (largest first)."
    );
    expect(partialScanLine({ scanned: 12, total: 12, treeTruncated: true })).toBe(
      "Scanned 12 of 12 source files (largest first)."
    );
    expect(partialScanLine({ scanned: 8, total: 8, treeTruncated: false })).toBeNull();
  });
});

describe("authorizeFirewallRepoAccess", () => {
  it("uses the GitHub App token when this user installed the repo", async () => {
    process.env.GITHUB_APP_ID = "1";
    process.env.GITHUB_APP_PRIVATE_KEY = "key";
    process.env.GITHUB_TOKEN = SERVER_PAT;
    const reads: string[] = [];

    const access = await authorizeFirewallRepoAccess({
      supabase: supabaseFor(["acme/widgets"]),
      userId: "user-1",
      owner: "acme",
      repo: "widgets",
      purpose: "scan",
      githubToken: USER_PAT,
      canReadRepo: async (token) => {
        reads.push(token);
        return true;
      },
      appTokenForRepo: async () => "ghs_install_token",
    });

    expect(access).toEqual({ ok: true, token: "ghs_install_token", source: "github_app" });
    expect(reads).toEqual([]);
  });

  it("accepts a personal token that can read the repo", async () => {
    process.env.GITHUB_APP_ID = "1";
    process.env.GITHUB_APP_PRIVATE_KEY = "key";
    process.env.GITHUB_TOKEN = SERVER_PAT;

    const access = await authorizeFirewallRepoAccess({
      supabase: supabaseFor([]),
      userId: "user-1",
      owner: "acme",
      repo: "widgets",
      purpose: "write",
      githubToken: USER_PAT,
      canReadRepo: async (token) => token === USER_PAT,
      appTokenForRepo: async () => "ghs_should_not_be_used",
    });

    expect(access).toEqual({ ok: true, token: USER_PAT, source: "github_token" });
  });

  it("does not swap a rejected personal token for the server token", async () => {
    process.env.GITHUB_TOKEN = SERVER_PAT;

    const access = await authorizeFirewallRepoAccess({
      supabase: supabaseFor([]),
      userId: "user-1",
      owner: "acme",
      repo: "widgets",
      purpose: "scan",
      githubToken: USER_PAT,
      canReadRepo: async () => false,
      appTokenForRepo: async () => null,
    });

    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.status).toBe(403);
  });

  it("scans with the server token when the signed-in user has no install and no personal token", async () => {
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    process.env.GITHUB_TOKEN = SERVER_PAT;

    const access = await authorizeFirewallRepoAccess({
      supabase: supabaseFor([]),
      userId: "user-1",
      owner: "acme",
      repo: "widgets",
      purpose: "scan",
      canReadRepo: async (token) => token === SERVER_PAT,
      appTokenForRepo: async () => {
        throw new Error("app token should not be minted");
      },
    });

    expect(access).toEqual({ ok: true, token: SERVER_PAT, source: "github_token" });
  });

  it("refuses a pull request for someone else's install when the App is configured", async () => {
    process.env.GITHUB_APP_ID = "1";
    process.env.GITHUB_APP_PRIVATE_KEY = "key";
    process.env.GITHUB_TOKEN = SERVER_PAT;

    const access = await authorizeFirewallRepoAccess({
      supabase: supabaseFor([]),
      userId: "user-1",
      owner: "acme",
      repo: "widgets",
      purpose: "write",
      canReadRepo: async () => true,
      appTokenForRepo: async () => "ghs_other_install",
    });

    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.status).toBe(403);
  });

  it("uses the server token to open a pull request only when the App is not configured", async () => {
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    process.env.GITHUB_TOKEN = SERVER_PAT;

    const access = await authorizeFirewallRepoAccess({
      supabase: supabaseFor([]),
      userId: "user-1",
      owner: "acme",
      repo: "widgets",
      purpose: "write",
      canReadRepo: async () => {
        throw new Error("write fallback should not probe GitHub");
      },
      appTokenForRepo: async () => null,
    });

    expect(access).toEqual({ ok: true, token: SERVER_PAT, source: "github_token" });
  });
});
