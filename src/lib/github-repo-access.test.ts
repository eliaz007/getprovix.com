import { afterEach, describe, expect, it } from "vitest";
import { resolveGithubRepoAccessToken } from "@/lib/github-app-client";

const ORIGINAL_APP_ID = process.env.GITHUB_APP_ID;
const ORIGINAL_APP_KEY = process.env.GITHUB_APP_PRIVATE_KEY;
const ORIGINAL_TOKEN = process.env.GITHUB_TOKEN;

afterEach(() => {
  if (ORIGINAL_APP_ID === undefined) delete process.env.GITHUB_APP_ID;
  else process.env.GITHUB_APP_ID = ORIGINAL_APP_ID;
  if (ORIGINAL_APP_KEY === undefined) delete process.env.GITHUB_APP_PRIVATE_KEY;
  else process.env.GITHUB_APP_PRIVATE_KEY = ORIGINAL_APP_KEY;
  if (ORIGINAL_TOKEN === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = ORIGINAL_TOKEN;
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
});
