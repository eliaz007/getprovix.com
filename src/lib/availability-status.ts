export const AVAILABILITY_STATUS_OPTIONS = [
  "Available Now",
  "Interviewing",
  "Not Available",
] as const;

export type AvailabilityStatus = (typeof AVAILABILITY_STATUS_OPTIONS)[number];

export const DEFAULT_AVAILABILITY_STATUS: AvailabilityStatus = "Available Now";

export function parseAvailabilityStatus(
  value: string | null | undefined
): AvailabilityStatus | null {
  const status = value?.trim();
  if (
    status &&
    AVAILABILITY_STATUS_OPTIONS.includes(status as AvailabilityStatus)
  ) {
    return status as AvailabilityStatus;
  }

  return null;
}

export function normalizeAvailabilityStatus(
  value: string | null | undefined
): AvailabilityStatus {
  return parseAvailabilityStatus(value) ?? DEFAULT_AVAILABILITY_STATUS;
}

export type AvailabilitySidebarTone = "emerald" | "violet" | "zinc";

export function getAvailabilitySidebarPresentation(
  value: string | null | undefined
): { label: string; tone: AvailabilitySidebarTone; dotClass: string } {
  const status = parseAvailabilityStatus(value);

  if (status === "Available Now") {
    return {
      label: "Available Now",
      tone: "emerald",
      dotClass: "bg-emerald-500",
    };
  }

  if (status === "Interviewing") {
    return {
      label: "Interviewing",
      tone: "violet",
      dotClass: "bg-violet-500",
    };
  }

  if (status === "Not Available") {
    return {
      label: "Not Available",
      tone: "zinc",
      dotClass: "bg-zinc-500",
    };
  }

  return {
    label: "Open to roles",
    tone: "emerald",
    dotClass: "bg-emerald-500",
  };
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
