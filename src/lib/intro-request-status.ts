export const INTRO_PIPELINE_STATUSES = [
  {
    value: "pending_admin_approval",
    label: "Pending Review",
  },
  {
    value: "approved_intro_sent",
    label: "Approved / Intro Sent",
  },
  {
    value: "interviewing",
    label: "Interviewing",
  },
  {
    value: "hired",
    label: "Hired",
  },
  {
    value: "passed",
    label: "Passed",
  },
] as const;

export type IntroPipelineStatus =
  (typeof INTRO_PIPELINE_STATUSES)[number]["value"];

export const INTRO_UNLOCK_STATUSES = new Set<IntroPipelineStatus | string>([
  "accepted",
  "approved_intro_sent",
  "interviewing",
  "hired",
  "approved",
  "completed",
]);

const LEGACY_STATUS_MAP: Record<string, IntroPipelineStatus> = {
  pending: "pending_admin_approval",
  accepted: "approved_intro_sent",
  approved: "approved_intro_sent",
  approved_intro_sent: "approved_intro_sent",
  interviewing: "interviewing",
  hired: "hired",
  passed: "passed",
  rejected: "passed",
  declined: "passed",
  completed: "approved_intro_sent",
};

export function normalizeIntroPipelineStatus(
  status: string | null | undefined
): IntroPipelineStatus {
  const normalized = (status ?? "").trim().toLowerCase();
  return LEGACY_STATUS_MAP[normalized] ?? "pending_admin_approval";
}

export function isIntroUnlockStatus(status: string | null | undefined): boolean {
  return INTRO_UNLOCK_STATUSES.has(normalizeIntroPipelineStatus(status));
}

export function getIntroStatusLabel(status: IntroPipelineStatus): string {
  return (
    INTRO_PIPELINE_STATUSES.find((entry) => entry.value === status)?.label ??
    status
  );
}

export function getIntroStatusBadgeClass(status: IntroPipelineStatus): string {
  switch (status) {
    case "approved_intro_sent":
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
    case "interviewing":
      return "text-indigo-300 bg-indigo-500/10 border-indigo-500/30";
    case "hired":
      return "text-emerald-300 bg-emerald-500/15 border-emerald-500/40";
    case "passed":
      return "text-slate-400 bg-slate-500/10 border-slate-600/40";
    default:
      return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  }
}
