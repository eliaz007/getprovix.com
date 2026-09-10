import type { AuditResult } from "@/app/api/audit/route";

export type PrivateOrNotFoundAuditResponse = {
  isPrivateOrNotFound: true;
  repoUrl: string;
  inaccessibleRepo?: boolean;
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
  if (input.status === 404 || input.status === 403) {
    return true;
  }

  if (isPrivateOrNotFoundAuditResponse(input.result)) {
    return true;
  }

  return (input.result?.redFlags ?? []).some((flag) =>
    /404 HTTP|returned a 404|private or otherwise inaccessible/i.test(flag)
  );
}
