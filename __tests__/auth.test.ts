import { describe, expect, it } from "vitest";
import {
  CANDIDATE_DASHBOARD_PATH,
  EMPLOYER_DASHBOARD_PATH,
  ROLE_ONBOARDING_PATH,
  isEmployerAuthIntent,
  normalizeAccountKind,
  resolveAccountRole,
  resolvePostAuthDestination,
  signupRoleFromSearch,
} from "@/lib/account-role";
import {
  canAccessTalentPool,
  isEmployeeRole,
  isEmployerRole,
  isProtectedAppPath,
  isVerifiedEmployerFlag,
  shouldSkipMiddlewareAuth,
} from "@/lib/dashboard-account";
import {
  getPostLoginPath,
  isAdminUser,
  isAllowedAdminUser,
} from "@/lib/admin-access";
import { AUTH_SESSION_TIMEOUT_MS } from "@/lib/auth-session-timeout";
import { buildOAuthCallbackUrl } from "@/lib/auth-callback-url";
import {
  getCorporateWorkEmailValidationMessage,
  isCorporateWorkEmail,
} from "@/lib/corporate-email";
import {
  getStandardEmailValidationMessage,
  isStandardEmail,
} from "@/lib/validate-email";

describe("authentication and session validation", () => {
  it("resolves account roles and post-auth destinations", () => {
    expect(normalizeAccountKind("business")).toBe("employer");
    expect(normalizeAccountKind("employee")).toBe("candidate");
    expect(
      resolveAccountRole(null, {
        user_metadata: { role: "employer" },
      } as never)
    ).toBe("employer");
    expect(
      resolvePostAuthDestination({ role: null, requestedNext: "/dashboard" })
    ).toBe(ROLE_ONBOARDING_PATH);
    expect(
      resolvePostAuthDestination({
        role: "employer",
        requestedNext: "/dashboard/profile",
      })
    ).toBe(EMPLOYER_DASHBOARD_PATH);
    expect(
      resolvePostAuthDestination({
        role: "candidate",
        requestedNext: "/dashboard?tab=talent",
      })
    ).toBe(CANDIDATE_DASHBOARD_PATH);
    expect(signupRoleFromSearch("?role=founder")).toBe("employer");
    expect(isEmployerAuthIntent("?next=/employer")).toBe(true);
  });

  it("gates middleware, employer verification, and admin access", () => {
    expect(AUTH_SESSION_TIMEOUT_MS).toBe(1500);
    expect(shouldSkipMiddlewareAuth("/login")).toBe(true);
    expect(shouldSkipMiddlewareAuth("/dashboard")).toBe(false);
    expect(isProtectedAppPath("/settings")).toBe(true);
    expect(isEmployerRole("employer")).toBe(true);
    expect(isEmployeeRole("employee")).toBe(true);
    expect(isVerifiedEmployerFlag(true)).toBe(true);
    expect(canAccessTalentPool("employer", true)).toBe(true);
    expect(canAccessTalentPool("employer", false)).toBe(false);

    expect(
      isAdminUser({
        email: "eliasdiangelo91@gmail.com",
        user_metadata: {},
      } as never)
    ).toBe(true);
    expect(
      isAllowedAdminUser({
        email: "dev@example.com",
        user_metadata: { role: "admin" },
      } as never)
    ).toBe(true);
    expect(
      getPostLoginPath({
        email: "dev@example.com",
        user_metadata: {},
      } as never)
    ).toBe("/dashboard");
  });

  it("validates auth emails and builds OAuth callback URLs", () => {
    expect(isStandardEmail("hire@acme.io")).toBe(true);
    expect(getStandardEmailValidationMessage("")).toBe(
      "Enter your email address."
    );
    expect(isCorporateWorkEmail("hire@gmail.com")).toBe(false);
    expect(getCorporateWorkEmailValidationMessage("hire@gmail.com")).toMatch(
      /corporate work email/i
    );

    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          origin: "https://getprovix.com",
          pathname: "/login",
          search: "?next=/audit",
        },
      },
    });
    expect(buildOAuthCallbackUrl()).toBe(
      "https://getprovix.com/auth/callback?next=%2Faudit"
    );

    if (originalWindow) {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    } else {
      // @ts-expect-error cleanup window shim
      delete globalThis.window;
    }
  });
});
