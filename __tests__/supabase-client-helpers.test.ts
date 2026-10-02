import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createBrowserClientMock = vi.fn();
const createClientMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: (...args: unknown[]) => createBrowserClientMock(...args),
  createServerClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: vi.fn(),
  })),
}));

import {
  findMentionedColumn,
  isSupabaseSchemaError,
  schemaErrorMentionsColumn,
} from "@/lib/supabase-schema-errors";
import {
  createServiceRoleClient,
  isAdminUser,
} from "@/lib/admin-access";
import { AUTH_SESSION_TIMEOUT_MS } from "@/lib/auth-session-timeout";

describe("Supabase client helpers", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalService = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.resetModules();
    createBrowserClientMock.mockReset();
    createClientMock.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
    if (originalService === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalService;
    }
  });

  it("detects schema and missing-column PostgREST errors", () => {
    expect(isSupabaseSchemaError({ code: "42P01" })).toBe(true);
    expect(isSupabaseSchemaError({ code: "PGRST204" })).toBe(true);
    expect(
      isSupabaseSchemaError({
        message: "Could not find the table 'public.profiles' in the schema cache",
      })
    ).toBe(true);
    expect(isSupabaseSchemaError({ code: "42501", message: "permission denied" })).toBe(
      false
    );
    expect(isSupabaseSchemaError(null)).toBe(false);

    expect(
      schemaErrorMentionsColumn(
        { message: "Could not find the 'tech_stack' column of 'jobs'" },
        "tech_stack"
      )
    ).toBe(true);
    expect(
      schemaErrorMentionsColumn(
        { message: "Could not find the 'tech_stack' column of 'jobs'" },
        "required_skills"
      )
    ).toBe(false);
    expect(
      findMentionedColumn(
        { message: "column required_skills does not exist" },
        ["tech_stack", "required_skills"]
      )
    ).toBe("required_skills");
  });

  it("creates a singleton browser client with auth and no-store fetch", async () => {
    const fakeClient = { auth: { getSession: vi.fn() } };
    createBrowserClientMock.mockReturnValue(fakeClient);

    const {
      createBrowserSupabaseClient,
      readBrowserSession,
      AUTH_SESSION_TIMEOUT_MS: timeout,
    } = await import("@/lib/supabaseClient");

    const first = createBrowserSupabaseClient();
    const second = createBrowserSupabaseClient();
    expect(first).toBe(second);
    expect(createBrowserClientMock).toHaveBeenCalledOnce();
    expect(createBrowserClientMock.mock.calls[0]?.[0]).toBe(
      "https://example.supabase.co"
    );
    expect(createBrowserClientMock.mock.calls[0]?.[1]).toBe("anon-key");
    expect(createBrowserClientMock.mock.calls[0]?.[2]).toMatchObject({
      cookieOptions: { path: "/", sameSite: "lax" },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    expect(timeout).toBe(AUTH_SESSION_TIMEOUT_MS);

    const utils = await import("@/utils/supabase/client");
    expect(utils.createClient()).toBe(fakeClient);
    expect(utils.createClientComponentClient()).toBe(fakeClient);

    fakeClient.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });
    await expect(readBrowserSession(fakeClient as never, 50)).resolves.toEqual({
      data: { session: { access_token: "token" } },
      error: null,
    });
  });

  it("builds a service-role client only when credentials exist", async () => {
    expect(createServiceRoleClient()).toBeNull();

    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const client = createServiceRoleClient();
    expect(client).not.toBeNull();
    expect(isAdminUser(null)).toBe(false);
  });

  it("creates a cookie-bound server client for route handlers", async () => {
    const fakeServerClient = { auth: { getUser: vi.fn() } };
    createClientMock.mockReturnValue(fakeServerClient);

    const { createClient } = await import("@/utils/supabase/server");
    const client = await createClient();
    expect(client).toBe(fakeServerClient);
    expect(createClientMock).toHaveBeenCalledOnce();
    expect(createClientMock.mock.calls[0]?.[0]).toBe(
      "https://example.supabase.co"
    );
    expect(createClientMock.mock.calls[0]?.[1]).toBe("anon-key");
    expect(createClientMock.mock.calls[0]?.[2]).toHaveProperty("cookies");
  });
});
