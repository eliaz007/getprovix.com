export const AVAILABILITY_STATUS_OPTIONS = [
  "Available Now",
  "Interviewing",
  "Not Available",
] as const;

export type AvailabilityStatus = (typeof AVAILABILITY_STATUS_OPTIONS)[number];

export const DEFAULT_AVAILABILITY_STATUS: AvailabilityStatus = "Available Now";

export function normalizeAvailabilityStatus(
  value: string | null | undefined
): AvailabilityStatus {
  if (
    value &&
    AVAILABILITY_STATUS_OPTIONS.includes(value as AvailabilityStatus)
  ) {
    return value as AvailabilityStatus;
  }

  return DEFAULT_AVAILABILITY_STATUS;
}

export function getAvailabilityBadgeClass(availability: string): string {
  if (availability === "Available Now") {
    return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  }

  if (availability === "Interviewing") {
    return "bg-violet-500/10 text-violet-400 border border-violet-500/20";
  }

  return "bg-slate-800 text-slate-500 border border-slate-700/50";
}
