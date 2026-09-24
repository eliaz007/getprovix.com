import type { AuditResult } from "@/app/api/audit/route";
import {
  REPO_NOT_FOUND_OR_PRIVATE,
  UNVERIFIED_OWNERSHIP,
} from "@/lib/github-ownership";
import { INVALID_REPO_FORMAT } from "@/lib/validate-github-url";

/** Shown when GitHub returns 401/403/404 or the repo is otherwise unreachable. */
export const INACCESSIBLE_PUBLIC_REPO_MESSAGE =
  "Repository is private or cannot be reached. Provix currently audits public repositories. Please provide a public GitHub repo URL.";

export type PrivateOrNotFoundAuditResponse = {
  isPrivateOrNotFound: true;
  repoUrl: string;
  inaccessibleRepo?: boolean;
  error?: string;
};

function auditErrorCode(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const error = (value as Record<string, unknown>).error;
  return typeof error === "string" ? error : null;
}

export function isUnverifiedOwnershipResponse(value: unknown): boolean {
  return auditErrorCode(value) === UNVERIFIED_OWNERSHIP;
}

export function isInvalidRepoFormatResponse(value: unknown): boolean {
  return auditErrorCode(value) === INVALID_REPO_FORMAT;
}

function readTrimmedField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

export function unverifiedOwnershipOwner(value: unknown): string | null {
  return readTrimmedField(value, "owner");
}

export function unverifiedOwnershipUsername(value: unknown): string | null {
  return (
    readTrimmedField(value, "username") ??
    readTrimmedField(value, "github_username")
  );
}

export function isPrivateOrNotFoundAuditResponse(
  value: unknown
): value is PrivateOrNotFoundAuditResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  if (isUnverifiedOwnershipResponse(value) || isInvalidRepoFormatResponse(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.error === REPO_NOT_FOUND_OR_PRIVATE ||
    record.isPrivateOrNotFound === true ||
    record.inaccessibleRepo === true
  );
}

export function isInaccessiblePublicAudit(input: {
  status?: number;
  result?:
    | (Partial<AuditResult> & {
        isPrivateOrNotFound?: boolean;
        repoUrl?: string;
        error?: string;
      })
    | null;
}): boolean {
  if (
    isUnverifiedOwnershipResponse(input.result) ||
    isInvalidRepoFormatResponse(input.result)
  ) {
    return false;
  }

  if (auditErrorCode(input.result) === REPO_NOT_FOUND_OR_PRIVATE) {
    return true;
  }

  if (
    input.status === 401 ||
    input.status === 404 ||
    (input.status === 403 && !isUnverifiedOwnershipResponse(input.result))
  ) {
    return true;
  }

  if (isPrivateOrNotFoundAuditResponse(input.result)) {
    return true;
  }

  return (input.result?.redFlags ?? []).some((flag) =>
    /404 HTTP|returned a 404|private or otherwise inaccessible|cannot be reached/i.test(
      flag
    )
  );
}
