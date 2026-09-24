import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  buildProvixVerificationToken,
  canBypassProvixTokenChallenge,
  normalizeProofToken,
} from "./provix-token";

function user(overrides: Record<string, unknown> = {}): User {
  return {
    id: "user-1",
    identities: [],
    user_metadata: {},
    app_metadata: {},
    ...overrides,
  } as unknown as User;
}

describe("provix token helpers", () => {
  it("builds a deterministic short-user token", () => {
    expect(
      buildProvixVerificationToken("a1b2c3d4-e5f6-7890-abcd-ef1234567890")
    ).toBe("provix-verify-a1b2c3d4");
  });

  it("bypasses the token challenge for GitHub OAuth or a verified profile", () => {
    expect(
      canBypassProvixTokenChallenge(
        user({
          identities: [{ provider: "github", identity_data: { user_name: "octo" } }],
        })
      )
    ).toBe(true);
    expect(
      canBypassProvixTokenChallenge(
        user({ app_metadata: { provider: "google", providers: ["google"] } }),
        true
      )
    ).toBe(true);
    expect(
      canBypassProvixTokenChallenge(
        user({ app_metadata: { provider: "email", providers: ["email"] } }),
        false
      )
    ).toBe(false);
  });

  it("trims BOM and whitespace from proof tokens", () => {
    expect(normalizeProofToken("\uFEFFprovix-verify-abcd  \n")).toBe(
      "provix-verify-abcd"
    );
  });
});
