import { describe, expect, it } from "vitest";
import { AUTH_SESSION_TIMEOUT_MS } from "@/lib/auth-session-timeout";
import {
  CANDIDATE_DASHBOARD_PATH,
  EMPLOYER_DASHBOARD_PATH,
  ROLE_ONBOARDING_PATH,
  isCandidateShellPath,
  isEmployerAllowedDashboardRequest,
  isEmployerAuthIntent,
  isEmployerDashboardRequest,
  normalizeAccountKind,
  profileDefaultsForAccountRole,
  resolveAccountRole,
  resolvePostAuthDestination,
  signupMetadataForKind,
  signupRoleFromSearch,
} from "@/lib/account-role";
import {
  canAccessTalentPool,
  isEmployeeRole,
  isEmployerRole,
  isProtectedAppPath,
  isPublicRoute,
  isVerifiedEmployerFlag,
  shouldSkipMiddlewareAuth,
} from "@/lib/dashboard-account";
import {
  getPostLoginPath,
  isAdminUser,
  isAllowedAdminUser,
} from "@/lib/admin-access";
import { buildOAuthCallbackUrl } from "@/lib/auth-callback-url";

describe("authentication and session validation", () => {
  it("keeps a short browser session timeout for mobile auth reads", () => {
    expect(AUTH_SESSION_TIMEOUT_MS).toBe(1500);
  });

  it("normalizes roles and post-auth destinations by account kind", () => {
    expect(normalizeAccountKind("business")).toBe("employer");
    expect(normalizeAccountKind("employee")).toBe("candidate");
    expect(normalizeAccountKind("unknown")).toBeNull();

    expect(
      resolveAccountRole("employer", {
        user_metadata: { role: "candidate" },
      } as never)
    ).toBe("employer");
    expect(
      resolveAccountRole(null, {
        user_metadata: { role: "business" },
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
    expect(
      resolvePostAuthDestination({
        role: "candidate",
        requestedNext: "/dashboard/auditor",
        isAdmin: true,
      })
    ).toBe("/admin");

    expect(profileDefaultsForAccountRole("employer")).toEqual({
      role: "employer",
      is_visible_in_pool: false,
    });
    expect(signupMetadataForKind("business", {
      first_name: "Ada",
      last_name: "Lovelace",
    }).role).toBe("employer");
    expect(signupRoleFromSearch("?role=founder")).toBe("employer");
    expect(isEmployerAuthIntent("?next=/employer/verify")).toBe(true);
  });

  it("gates middleware, employer shells, and talent-pool verification", () => {
    expect(shouldSkipMiddlewareAuth("/login")).toBe(true);
    expect(shouldSkipMiddlewareAuth("/dashboard")).toBe(false);
    expect(isPublicRoute("/audit")).toBe(true);
    expect(isProtectedAppPath("/settings")).toBe(true);

    expect(isEmployerRole("employer")).toBe(true);
    expect(isEmployeeRole("employee")).toBe(true);
    expect(isEmployeeRole("candidate")).toBe(false);
    expect(isVerifiedEmployerFlag(true)).toBe(true);
    expect(canAccessTalentPool("employer", true)).toBe(true);
    expect(canAccessTalentPool("employer", false)).toBe(false);
    expect(canAccessTalentPool("candidate", true)).toBe(false);

    expect(isEmployerDashboardRequest("/dashboard", "?tab=talent")).toBe(true);
    expect(isEmployerAllowedDashboardRequest("/dashboard", "?tab=auditor")).toBe(
      true
    );
    expect(isCandidateShellPath("/dashboard/profile")).toBe(true);
    expect(isCandidateShellPath("/dashboard", "?tab=talent")).toBe(false);
  });

  it("classifies admins and builds safe OAuth callback URLs", () => {
    const admin = {
      email: "eliasdiangelo91@gmail.com",
      user_metadata: {},
    } as never;
    const metadataAdmin = {
      email: "someone@example.com",
      user_metadata: { role: "admin" },
    } as never;
    const regular = {
      email: "dev@example.com",
      user_metadata: { role: "candidate" },
    } as never;

    expect(isAdminUser(admin)).toBe(true);
    expect(isAllowedAdminUser(metadataAdmin)).toBe(true);
    expect(isAdminUser(regular)).toBe(false);
    expect(getPostLoginPath(admin)).toBe("/admin");
    expect(getPostLoginPath(regular)).toBe("/dashboard");

    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          origin: "https://getprovix.com",
          pathname: "/login",
          search: "?next=/opportunities",
        },
      },
    });
    expect(buildOAuthCallbackUrl()).toBe(
      "https://getprovix.com/auth/callback?next=%2Fopportunities"
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          origin: "https://getprovix.com",
          pathname: "/pricing",
          search: "",
        },
      },
    });
    expect(buildOAuthCallbackUrl()).toBe(
      "https://getprovix.com/auth/callback?next=%2Fdashboard"
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          origin: "https://getprovix.com",
          pathname: "/audit",
          search: "",
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
      // @ts-expect-error cleanup test window shim
      delete globalThis.window;
    }
  });
});
