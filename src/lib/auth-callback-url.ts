const RETURNABLE_PATH_PREFIXES = [
  "/opportunities",
  "/audit",
  "/audits",
  "/onboarding",
  "/dashboard",
] as const;

/** Stash post-OAuth destination; query-string redirectTo is often not allow-listed. */
export const OAUTH_NEXT_COOKIE = "provix_oauth_next";

export function isSafeOAuthNextPath(
  path: string | null | undefined
): path is string {
  if (!path) {
    return false;
  }
  const trimmed = path.trim();
  return (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("\\")
  );
}

export function rememberOAuthNext(path: string) {
  if (typeof document === "undefined" || !isSafeOAuthNextPath(path)) {
    return;
  }
  document.cookie = `${OAUTH_NEXT_COOKIE}=${encodeURIComponent(path)}; Path=/; Max-Age=600; SameSite=Lax`;
}

export function clearOAuthNextCookie() {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${OAUTH_NEXT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** Exact callback URL — matches Supabase allow-listed Redirect URLs (no query). */
export function buildExactOAuthCallbackUrl(origin = window.location.origin): string {
  return `${origin}/auth/callback`;
}

function decodePathCandidate(raw: string): string {
  try {
    return decodeURIComponent(raw.trim());
  } catch {
    return raw.trim();
  }
}

/**
 * Prefer explicit next (query or cookie). Password recovery wins.
 * Falls back to /dashboard.
 */
export function resolveOAuthSuccessPath(
  nextParam: string | null | undefined,
  cookieNext?: string | null
): string {
  const candidates = [nextParam, cookieNext];

  for (const raw of candidates) {
    if (!raw) {
      continue;
    }
    const path = decodePathCandidate(raw);
    if (
      path === "/update-password" ||
      path.startsWith("/update-password?")
    ) {
      return "/update-password";
    }
    if (isSafeOAuthNextPath(path)) {
      return path;
    }
  }

  return "/dashboard";
}

export function buildOAuthCallbackUrl(): string {
  const { origin, pathname, search } = window.location;

  if (pathname === "/login" || pathname.startsWith("/login/")) {
    const params = new URLSearchParams(search);
    const next = params.get("next")?.trim() ?? "";
    const destination = isSafeOAuthNextPath(next) ? next : "/dashboard";
    rememberOAuthNext(destination);
    return buildExactOAuthCallbackUrl(origin);
  }

  const canReturn = RETURNABLE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (canReturn) {
    rememberOAuthNext(pathname);
  } else {
    rememberOAuthNext("/dashboard");
  }

  return buildExactOAuthCallbackUrl(origin);
}
