import { createHash, randomBytes } from "crypto";
import { normalizeSiteUrl } from "@/lib/site";

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
  // Frontend page — not the API — so corporate spam filters don't flag a raw API URL.
  const url = new URL("/verify-email", normalizeSiteUrl(origin));
  url.searchParams.set("token", token);
  return url.toString();
}
