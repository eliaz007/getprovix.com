export type CandidateIntroStatus = "pending" | "accepted" | "declined";

export type CandidateIntroRequestRow = {
  id: string;
  candidate_id: string;
  candidate_name: string | null;
  company_name: string | null;
  company_email: string | null;
  work_email: string | null;
  target_role: string | null;
  role_title: string | null;
  compensation_range: string | null;
  compensation_band: string | null;
  status: string;
  tos_accepted_at: string | null;
  terms_agreed_at: string | null;
  created_at: string;
  response_token?: string | null;
};

export const CANDIDATE_INTRO_REQUEST_COLUMNS =
  "id, candidate_id, candidate_name, company_name, company_email, work_email, target_role, role_title, compensation_range, compensation_band, status, tos_accepted_at, terms_agreed_at, created_at, response_token";

export const CANDIDATE_INTRO_REQUEST_PUBLIC_COLUMNS =
  "id, candidate_id, candidate_name, company_name, company_email, work_email, target_role, role_title, compensation_range, compensation_band, status, tos_accepted_at, terms_agreed_at, created_at";

export const INTRO_REQUEST_LEGACY_SELECT_COLUMNS =
  "id, candidate_id, candidate_name, company_name, work_email, role_title, compensation_band, status, terms_agreed_at, created_at";

export function resolveIntroCompanyEmail(
  row: Pick<CandidateIntroRequestRow, "company_email" | "work_email">
): string {
  return row.company_email?.trim() || row.work_email?.trim() || "";
}

export function resolveIntroTargetRole(
  row: Pick<CandidateIntroRequestRow, "target_role" | "role_title">
): string {
  return row.target_role?.trim() || row.role_title?.trim() || "Open role";
}

export function resolveIntroCompensationRange(
  row: Pick<CandidateIntroRequestRow, "compensation_range" | "compensation_band">
): string {
  return (
    row.compensation_range?.trim() ||
    row.compensation_band?.trim() ||
    "Not specified"
  );
}

export function normalizeCandidateIntroStatus(
  status: string | null | undefined
): CandidateIntroStatus {
  const normalized = (status ?? "").trim().toLowerCase();

  if (
    normalized === "accepted" ||
    normalized === "approved_intro_sent" ||
    normalized === "approved" ||
    normalized === "completed"
  ) {
    return "accepted";
  }

  if (
    normalized === "declined" ||
    normalized === "passed" ||
    normalized === "rejected"
  ) {
    return "declined";
  }

  return "pending";
}

export function isPendingCandidateIntroStatus(
  status: string | null | undefined
): boolean {
  return normalizeCandidateIntroStatus(status) === "pending";
}

export function getCandidateIntroStatusUpdates(
  action: "accept" | "decline"
): string[] {
  return action === "accept"
    ? ["accepted", "approved_intro_sent", "approved"]
    : ["declined", "passed", "rejected"];
}

export function toCandidateIntroStatus(
  storedStatus: string
): CandidateIntroStatus {
  return normalizeCandidateIntroStatus(storedStatus);
}

export function getCandidateIntroStatusLabel(
  status: string | null | undefined
): string {
  switch (normalizeCandidateIntroStatus(status)) {
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    default:
      return "Pending";
  }
}

export function getCandidateIntroStatusBadgeClass(
  status: string | null | undefined
): string {
  switch (normalizeCandidateIntroStatus(status)) {
    case "accepted":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
    case "declined":
      return "bg-slate-500/10 text-slate-400 border-slate-600/40";
    default:
      return "bg-amber-500/10 text-amber-400 border-amber-500/25";
  }
}

export function buildIntroRequestInsertPayload(input: {
  userId: string;
  candidateId: string;
  candidateName: string;
  companyName: string;
  companyEmail: string;
  targetRole: string;
  compensationRange: string;
  tosAcceptedAt: string;
  responseToken: string;
}) {
  return {
    user_id: input.userId,
    candidate_id: input.candidateId,
    candidate_name: input.candidateName,
    company_name: input.companyName,
    company_email: input.companyEmail,
    work_email: input.companyEmail,
    target_role: input.targetRole,
    role_title: input.targetRole,
    compensation_range: input.compensationRange,
    compensation_band: input.compensationRange,
    tos_accepted_at: input.tosAcceptedAt,
    terms_agreed_at: input.tosAcceptedAt,
    terms_accepted: true,
    status: "pending" as const,
    response_token: input.responseToken,
  };
}
