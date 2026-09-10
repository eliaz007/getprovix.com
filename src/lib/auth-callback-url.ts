const RETURNABLE_PATH_PREFIXES = ["/opportunities", "/audit", "/audits"] as const;

export function buildOAuthCallbackUrl(): string {
  const { origin, pathname, search } = window.location;

  if (pathname === "/login" || pathname.startsWith("/login/")) {
    const params = new URLSearchParams(search);
    const next = params.get("next")?.trim() ?? "";
    const destination =
      next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
        ? next
        : "/dashboard";
    return `${origin}/auth/callback?next=${encodeURIComponent(destination)}`;
  }
  const canReturn = RETURNABLE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (!canReturn) {
    return `${origin}/auth/callback`;
  }

  return `${origin}/auth/callback?next=${encodeURIComponent(pathname)}`;
}
