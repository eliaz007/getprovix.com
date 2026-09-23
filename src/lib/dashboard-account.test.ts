import { describe, expect, it } from "vitest";
import {
  isProtectedAppPath,
  isPublicRoute,
  isStaticAssetPath,
  shouldSkipMiddlewareAuth,
} from "./dashboard-account";

describe("shouldSkipMiddlewareAuth", () => {
  it("skips the public homepage and marketing routes", () => {
    expect(shouldSkipMiddlewareAuth("/")).toBe(true);
    expect(shouldSkipMiddlewareAuth("/login")).toBe(true);
    expect(shouldSkipMiddlewareAuth("/pricing")).toBe(true);
    expect(shouldSkipMiddlewareAuth("/privacy")).toBe(true);
    expect(shouldSkipMiddlewareAuth("/terms")).toBe(true);
    expect(shouldSkipMiddlewareAuth("/audit")).toBe(true);
    expect(isPublicRoute("/")).toBe(true);
  });

  it("skips static assets", () => {
    expect(isStaticAssetPath("/favicon.ico")).toBe(true);
    expect(isStaticAssetPath("/_next/static/chunks/app.js")).toBe(true);
    expect(isStaticAssetPath("/logo.svg")).toBe(true);
    expect(shouldSkipMiddlewareAuth("/_next/image")).toBe(true);
  });

  it("runs auth only on protected app paths", () => {
    expect(shouldSkipMiddlewareAuth("/dashboard")).toBe(false);
    expect(shouldSkipMiddlewareAuth("/dashboard/profile")).toBe(false);
    expect(shouldSkipMiddlewareAuth("/settings")).toBe(false);
    expect(isProtectedAppPath("/dashboard")).toBe(true);
    expect(isProtectedAppPath("/settings")).toBe(true);
  });
});
