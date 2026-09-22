import type { AuditResult } from "@/app/api/audit/route";

/** Shown when GitHub returns 401/403/404 or the repo is otherwise unreachable. */
export const INACCESSIBLE_PUBLIC_REPO_MESSAGE =
  "Repository is private or cannot be reached. Provix currently audits public repositories. Please provide a public GitHub repo URL.";

export type PrivateOrNotFoundAuditResponse = {
  isPrivateOrNotFound: true;
  repoUrl: string;
  inaccessibleRepo?: boolean;
  error?: string;
};

export function isPrivateOrNotFoundAuditResponse(
  value: unknown
): value is PrivateOrNotFoundAuditResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
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
      })
    | null;
}): boolean {
  if (
    input.status === 401 ||
    input.status === 403 ||
    input.status === 404
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
