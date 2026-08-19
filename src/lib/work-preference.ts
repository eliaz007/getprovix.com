export const WORK_PREFERENCE_OPTIONS = [
  { value: "remote_global", label: "Remote (Worldwide)" },
  { value: "remote_americas", label: "Remote (Americas)" },
  { value: "remote_emea", label: "Remote (EMEA)" },
  { value: "hybrid_onsite", label: "Hybrid / Onsite" },
] as const;

export const TIMEZONE_OPTIONS = [
  { value: "US_PT", label: "US / Canada - Pacific (PT)" },
  { value: "US_MT", label: "US / Canada - Mountain (MT)" },
  { value: "US_CT", label: "US / Canada - Central (CT)" },
  { value: "US_ET", label: "US / Canada - Eastern (ET)" },
  { value: "LATAM", label: "Latin America (UTC-3 to -5)" },
  { value: "UK_WEU", label: "UK & Western Europe (GMT/CET)" },
  { value: "CEE_EET", label: "Central / Eastern Europe (EET)" },
  { value: "IN_SASIA", label: "India & South Asia (IST)" },
  { value: "ESEA", label: "East / SE Asia (SGT/JST)" },
  { value: "AU_NZ", label: "Australia & NZ (AEST)" },
] as const;

export type WorkPreference = (typeof WORK_PREFERENCE_OPTIONS)[number]["value"];
export type CandidateTimezone = (typeof TIMEZONE_OPTIONS)[number]["value"];

export const DEFAULT_WORK_PREFERENCE: WorkPreference = "remote_global";
export const DEFAULT_CANDIDATE_TIMEZONE: CandidateTimezone = "US_ET";

const TIMEZONE_SHORT_LABELS: Record<CandidateTimezone, string> = {
  US_PT: "Pacific (PT)",
  US_MT: "Mountain (MT)",
  US_CT: "Central (CT)",
  US_ET: "US Eastern (ET)",
  LATAM: "Latin America",
  UK_WEU: "UK / Western Europe",
  CEE_EET: "Central / Eastern Europe",
  IN_SASIA: "India & South Asia",
  ESEA: "East / SE Asia",
  AU_NZ: "Australia & NZ",
};

const WORK_PREFERENCE_VALUES = new Set<string>(
  WORK_PREFERENCE_OPTIONS.map((option) => option.value)
);

const TIMEZONE_VALUES = new Set<string>(
  TIMEZONE_OPTIONS.map((option) => option.value)
);

export function normalizeWorkPreference(
  value?: string | null
): WorkPreference {
  const trimmed = value?.trim();
  if (trimmed && WORK_PREFERENCE_VALUES.has(trimmed)) {
    return trimmed as WorkPreference;
  }

  return DEFAULT_WORK_PREFERENCE;
}

export function normalizeCandidateTimezone(
  value?: string | null
): CandidateTimezone | string {
  const trimmed = value?.trim();
  if (trimmed && TIMEZONE_VALUES.has(trimmed)) {
    return trimmed as CandidateTimezone;
  }

  if (trimmed) {
    return trimmed;
  }

  return DEFAULT_CANDIDATE_TIMEZONE;
}

export function getWorkPreferenceLabel(value?: string | null): string {
  const normalized = normalizeWorkPreference(value);
  return (
    WORK_PREFERENCE_OPTIONS.find((option) => option.value === normalized)
      ?.label ?? "Remote (Worldwide)"
  );
}

export function getTimezoneLabel(value?: string | null): string {
  const trimmed = value?.trim();
  if (trimmed && TIMEZONE_VALUES.has(trimmed)) {
    return (
      TIMEZONE_OPTIONS.find((option) => option.value === trimmed)?.label ??
      trimmed
    );
  }

  return trimmed || getTimezoneShortLabel(DEFAULT_CANDIDATE_TIMEZONE);
}

export function getTimezoneShortLabel(value?: string | null): string {
  const trimmed = value?.trim();
  if (trimmed && TIMEZONE_VALUES.has(trimmed)) {
    return TIMEZONE_SHORT_LABELS[trimmed as CandidateTimezone];
  }

  if (trimmed) {
    return trimmed;
  }

  return TIMEZONE_SHORT_LABELS[DEFAULT_CANDIDATE_TIMEZONE];
}

export function getWorkPreferenceBadgePrefix(value?: string | null): string {
  const preference = normalizeWorkPreference(value);

  if (preference === "hybrid_onsite") {
    return "📍 Hybrid / Onsite";
  }

  if (preference === "remote_americas") {
    return "⚡ Remote (Americas)";
  }

  if (preference === "remote_emea") {
    return "⚡ Remote (EMEA)";
  }

  return "⚡ Remote";
}

export function formatWorkPreferenceTimezoneBadge(
  workPreference?: string | null,
  timezone?: string | null
): string {
  return `${getWorkPreferenceBadgePrefix(workPreference)} · ${getTimezoneShortLabel(timezone)}`;
}
