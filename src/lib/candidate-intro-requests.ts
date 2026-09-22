export type CandidateIntroStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "dismissed";

export type CandidateIntroInboxFilter = "inbox" | "dismissed";

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
  candidate_dismissed_at?: string | null;
  response_token?: string | null;
};

const CANDIDATE_INTRO_REQUEST_BASE_COLUMNS =
  "id, candidate_id, candidate_name, company_name, company_email, work_email, target_role, role_title, compensation_range, compensation_band, status, tos_accepted_at, terms_agreed_at, created_at";

export const CANDIDATE_INTRO_REQUEST_PUBLIC_COLUMNS_FALLBACK =
  CANDIDATE_INTRO_REQUEST_BASE_COLUMNS;

export const CANDIDATE_INTRO_REQUEST_PUBLIC_COLUMNS =
  "id, candidate_id, candidate_name, company_name, company_email, work_email, target_role, role_title, compensation_range, compensation_band, status, tos_accepted_at, terms_agreed_at, created_at, candidate_dismissed_at";

export const CANDIDATE_INTRO_REQUEST_COLUMNS =
  `${CANDIDATE_INTRO_REQUEST_BASE_COLUMNS}, response_token`;

export const INTRO_REQUEST_LEGACY_SELECT_COLUMNS =
  "id, candidate_id, candidate_name, company_name, work_email, role_title, compensation_band, status, terms_agreed_at, created_at";

export function resolveIntroCompanyEmail(row: {
  company_email?: string | null;
  work_email?: string | null;
}): string {
  return row.company_email?.trim() || row.work_email?.trim() || "";
}

export function resolveIntroTargetRole(row: {
  target_role?: string | null;
  role_title?: string | null;
}): string {
  return row.target_role?.trim() || row.role_title?.trim() || "Open role";
}

export function resolveIntroCompensationRange(row: {
  compensation_range?: string | null;
  compensation_band?: string | null;
}): string {
  return (
    row.compensation_range?.trim() ||
    row.compensation_band?.trim() ||
    "Not specified"
  );
}

export function isCandidateIntroDismissed(
  request: Pick<CandidateIntroRequestRow, "status" | "candidate_dismissed_at">
): boolean {
  if (request.candidate_dismissed_at) {
    return true;
  }

  const normalized = (request.status ?? "").trim().toLowerCase();
  return normalized === "dismissed" || normalized === "trashed";
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

  if (normalized === "dismissed" || normalized === "trashed") {
    return "dismissed";
  }

  return "pending";
}

export function isPendingCandidateIntroStatus(
  status: string | null | undefined
): boolean {
  return normalizeCandidateIntroStatus(status) === "pending";
}

export function getCandidateIntroStatusUpdates(
  action: "accept" | "decline" | "dismiss"
): string[] {
  if (action === "accept") {
    return ["accepted", "approved_intro_sent", "approved"];
  }
  if (action === "dismiss") {
    return ["dismissed", "trashed"];
  }
  return ["declined", "passed", "rejected"];
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
    case "dismissed":
      return "Dismissed";
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
    case "dismissed":
      return "bg-zinc-500/10 text-zinc-400 border-zinc-600/40";
    default:
      return "bg-violet-500/10 text-violet-400 border-violet-500/25";
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
