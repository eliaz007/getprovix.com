const STANDARD_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim();
}

export function isStandardEmail(value: string): boolean {
  const normalized = normalizeEmail(value);
  if (!normalized) {
    return false;
  }

  return STANDARD_EMAIL_PATTERN.test(normalized);
}

export function getStandardEmailValidationMessage(value: string): string | null {
  if (!normalizeEmail(value)) {
    return "Enter your email address.";
  }

  if (!isStandardEmail(value)) {
    return "Enter a valid email address.";
  }

  return null;
}

export function buildPasswordResetRedirectUrl(origin: string): string {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", "/update-password");
  return url.toString();
}
