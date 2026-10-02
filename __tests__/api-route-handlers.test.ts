import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import {
  consumeRateLimit,
  getRequestIp,
  tooManyRequestsResponse,
} from "@/lib/ip-rate-limit";
import { parseIntroRequestId } from "@/lib/admin-api-auth";
import { canonicalGitHubRepoUrl } from "@/lib/provix-token";

vi.mock("@/lib/api-auth", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/provix-token-server", () => ({
  findMatchingProvixFile: vi.fn(),
  persistVerifiedRepo: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

describe("Next.js API route handler helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("extracts client IPs and enforces route rate limits", () => {
    const forwarded = new Request("https://getprovix.com/api/audit", {
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
    });
    expect(getRequestIp(forwarded)).toBe("203.0.113.10");

    const realIp = new Request("https://getprovix.com/api/audit", {
      headers: { "x-real-ip": "198.51.100.7" },
    });
    expect(getRequestIp(realIp)).toBe("198.51.100.7");
    expect(getRequestIp(new Request("https://getprovix.com/api/audit"))).toBe(
      "unknown"
    );

    const key = `api-route-test:${Date.now()}`;
    expect(consumeRateLimit(key, 2, 60_000).ok).toBe(true);
    expect(consumeRateLimit(key, 2, 60_000).ok).toBe(true);
    const blocked = consumeRateLimit(key, 2, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);

    const response = tooManyRequestsResponse(12);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
  });

  it("parses intro request ids and normalizes GitHub repo URLs for handlers", () => {
    expect(parseIntroRequestId({ requestId: " req-1 " })).toBe("req-1");
    expect(parseIntroRequestId({ id: "id-2" })).toBe("id-2");
    expect(parseIntroRequestId({ introId: "intro-3" })).toBe("intro-3");
    expect(parseIntroRequestId({})).toBe("");
    expect(canonicalGitHubRepoUrl("Acme", "Widgets")).toBe(
      "https://github.com/acme/widgets"
    );
  });

  it("returns 401 and 400 from verify-repo before persistence", async () => {
    const { requireApiUser } = await import("@/lib/api-auth");
    const { POST } = await import("@/app/api/verify-repo/route");

    vi.mocked(requireApiUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const unauthorized = await POST(
      new Request("https://getprovix.com/api/verify-repo", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(unauthorized.status).toBe(401);

    vi.mocked(requireApiUser).mockResolvedValue({
      user: { id: "user-1" },
      supabase: {} as never,
    } as never);

    const missingRepo = await POST(
      new Request("https://getprovix.com/api/verify-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "abc" }),
      })
    );
    expect(missingRepo.status).toBe(400);
    await expect(missingRepo.json()).resolves.toMatchObject({
      error: "repo_url is required.",
    });

    const missingToken = await POST(
      new Request("https://getprovix.com/api/verify-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_url: "https://github.com/acme/widgets",
        }),
      })
    );
    expect(missingToken.status).toBe(400);
    await expect(missingToken.json()).resolves.toMatchObject({
      error: "token is required.",
    });

    const badUrl = await POST(
      new Request("https://getprovix.com/api/verify-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_url: "https://github.com/acme",
          token: "abc",
        }),
      })
    );
    expect(badUrl.status).toBe(400);
  });

  it("signs out through the auth API route and clears supabase cookies", async () => {
    const { createClient } = await import("@/utils/supabase/server");
    const { cookies } = await import("next/headers");
    const signOut = vi.fn().mockResolvedValue({});
    const deleteCookie = vi.fn();

    vi.mocked(createClient).mockResolvedValue({
      auth: { signOut },
    } as never);
    vi.mocked(cookies).mockResolvedValue({
      getAll: () => [
        { name: "sb-access-token", value: "a" },
        { name: "other", value: "b" },
        { name: "my-supabase-session", value: "c" },
      ],
      delete: deleteCookie,
    } as never);

    const { POST } = await import("@/app/api/auth/signout/route");
    const response = await POST();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(signOut).toHaveBeenCalledOnce();
    expect(deleteCookie).toHaveBeenCalledWith("sb-access-token");
    expect(deleteCookie).toHaveBeenCalledWith("my-supabase-session");
    expect(deleteCookie).not.toHaveBeenCalledWith("other");
  });
});
