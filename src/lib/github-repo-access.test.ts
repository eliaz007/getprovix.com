import { afterEach, describe, expect, it } from "vitest";
import {
  resolveGithubFallbackReadToken,
  resolveGithubRepoAccessToken,
  resolveGithubRepoReadToken,
} from "@/lib/github-app-client";

const ORIGINAL_APP_ID = process.env.GITHUB_APP_ID;
const ORIGINAL_APP_KEY = process.env.GITHUB_APP_PRIVATE_KEY;
const ORIGINAL_TOKEN = process.env.GITHUB_TOKEN;
const ORIGINAL_PAT = process.env.GITHUB_PAT;

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

describe("resolveGithubRepoAccessToken", () => {
  it("falls back to GITHUB_TOKEN when the GitHub App is not configured", async () => {
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    process.env.GITHUB_TOKEN = "ghp_test_token";

    const access = await resolveGithubRepoAccessToken("acme", "widgets");
    expect(access).toEqual({ ok: true, token: "ghp_test_token", source: "github_token" });
  });

  it("fails clearly when neither App nor GITHUB_TOKEN is configured", async () => {
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_TOKEN;

    const access = await resolveGithubRepoAccessToken("acme", "widgets");
    expect(access.ok).toBe(false);
    if (access.ok) return;
    expect(access.status).toBe(401);
    expect(access.message).toMatch(/GitHub App credentials are not configured/i);
  });

  it("does not fall back to GITHUB_TOKEN when App credentials exist but install lookup fails", async () => {
    process.env.GITHUB_APP_ID = "12345";
    process.env.GITHUB_APP_PRIVATE_KEY = "not-a-real-key";
    process.env.GITHUB_TOKEN = "ghp_should_not_be_used";

    const access = await resolveGithubRepoAccessToken("acme", "widgets");
    expect(access.ok).toBe(false);
    if (access.ok) return;
    expect(access.status).toBe(403);
    expect(access.message).toMatch(/not installed on acme\/widgets/i);
  });

  it("soft-reads still fall back to GITHUB_TOKEN when App install is missing", async () => {
    process.env.GITHUB_APP_ID = "12345";
    process.env.GITHUB_APP_PRIVATE_KEY = "not-a-real-key";
    process.env.GITHUB_TOKEN = "ghp_read_ok";

    const read = await resolveGithubRepoReadToken("acme", "widgets");
    expect(read).toEqual({ token: "ghp_read_ok", source: "github_token" });
  });

  it("exposes the shared PAT fallback helper", () => {
    process.env.GITHUB_TOKEN = "";
    process.env.GITHUB_PAT = "ghp_pat_only";
    expect(resolveGithubFallbackReadToken()).toBe("ghp_pat_only");
  });
});
