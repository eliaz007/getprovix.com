import { createHash, randomBytes } from "crypto";

export const EMPLOYER_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export function generateEmployerVerificationToken(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashEmployerVerificationToken(token),
  };
}

export function hashEmployerVerificationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildEmployerVerificationConfirmUrl(
  origin: string,
  token: string
): string {
  const url = new URL("/api/employer/verify-email/confirm", origin);
  url.searchParams.set("token", token);
  return url.toString();
}
