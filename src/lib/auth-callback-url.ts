const RETURNABLE_PATH_PREFIXES = ["/opportunities", "/audits"] as const;

export function buildOAuthCallbackUrl(): string {
  const { origin, pathname } = window.location;
  const canReturn = RETURNABLE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (!canReturn) {
    return `${origin}/auth/callback`;
  }

  return `${origin}/auth/callback?next=${encodeURIComponent(pathname)}`;
}
