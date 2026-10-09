export const CONTRACT_HOURS_OPTIONS = [
  "10 hrs/week (Fractional / Nights & Weekends)",
  "20 hrs/week (Part-Time Core Sprint)",
  "30+ hrs/week (Dedicated Fractional)",
] as const;

export type ContractHoursPerWeek = (typeof CONTRACT_HOURS_OPTIONS)[number];

/** Employer talent-pool bandwidth filter labels → stored profile values. */
export const CONTRACT_BANDWIDTH_FILTER_OPTIONS = [
  {
    value: "all",
    label: "All Capacities",
  },
  {
    value: "10 hrs/week (Fractional / Nights & Weekends)",
    label: "10 hrs/week (Fractional)",
  },
  {
    value: "20 hrs/week (Part-Time Core Sprint)",
    label: "20 hrs/week (Core Sprint)",
  },
  {
    value: "30+ hrs/week (Dedicated Fractional)",
    label: "30+ hrs/week (Dedicated)",
  },
] as const;

export type ContractBandwidthFilterValue =
  (typeof CONTRACT_BANDWIDTH_FILTER_OPTIONS)[number]["value"];

/** Job posting Weekly Bandwidth dropdown (excludes "All Capacities"). */
export const JOB_CONTRACT_BANDWIDTH_OPTIONS =
  CONTRACT_BANDWIDTH_FILTER_OPTIONS.filter(
    (option) => option.value !== "all"
  ) as ReadonlyArray<{
    value: ContractHoursPerWeek;
    label: string;
  }>;

/** Provix marketplace markup on contractor take-home (all-inclusive founder rate). */
export const PROVIX_CONTRACT_RATE_MARKUP = 1.25;

const LEGACY_CONTRACT_HOURS_MAP: Record<string, ContractHoursPerWeek> = {
  "< 10 hrs/week": "10 hrs/week (Fractional / Nights & Weekends)",
  "10-20 hrs/week": "20 hrs/week (Part-Time Core Sprint)",
  "20-40 hrs/week": "30+ hrs/week (Dedicated Fractional)",
};

/** Audit score required to open marketplace availability preferences. */
export const MARKETPLACE_AVAILABILITY_SCORE_THRESHOLD = 75;

export const MARKETPLACE_AVAILABILITY_LOCKED_MESSAGE =
  "An audit score of 75+ is required to unlock marketplace visibility. Re-run an audit after hardening your test coverage and API schemas.";

export const MARKETPLACE_AVAILABILITY_SAVE_BLOCKED_MESSAGE =
  "A 75+ production audit is required before you can open full-time or contract availability.";

const CONTRACT_HOURS_VALUES = new Set<string>(CONTRACT_HOURS_OPTIONS);

export function resolveMarketplaceAuditScore(
  ...scores: Array<number | null | undefined>
): number | null {
  for (const score of scores) {
    if (typeof score === "number" && Number.isFinite(score)) {
      return Math.round(score);
    }
  }
  return null;
}

export function isMarketplaceAvailabilityQualified(
  auditScore: number | null | undefined
): boolean {
  return (
    typeof auditScore === "number" &&
    Number.isFinite(auditScore) &&
    auditScore >= MARKETPLACE_AVAILABILITY_SCORE_THRESHOLD
  );
}

export function formatMarketplaceAvailabilityLockedAlert(
  auditScore: number | null | undefined
): string {
  const scoreLabel =
    typeof auditScore === "number" && Number.isFinite(auditScore)
      ? String(Math.round(auditScore))
      : "—";
  return `Score: ${scoreLabel}/100 — ${MARKETPLACE_AVAILABILITY_LOCKED_MESSAGE}`;
}

export function formatMarketplaceEligibleBadge(
  auditScore: number | null | undefined
): string {
  const scoreLabel =
    typeof auditScore === "number" && Number.isFinite(auditScore)
      ? String(Math.round(auditScore))
      : "—";
  return `Marketplace Eligible (Score: ${scoreLabel}/100)`;
}

export const MARKETPLACE_ENGAGEMENT_MODES = ["fulltime", "contract"] as const;

export type MarketplaceEngagementMode =
  (typeof MARKETPLACE_ENGAGEMENT_MODES)[number];

export const DEFAULT_MARKETPLACE_ENGAGEMENT_MODE: MarketplaceEngagementMode =
  "fulltime";

export function marketplaceEngagementLabel(
  mode: MarketplaceEngagementMode
): "Full-Time" | "Contract" {
  return mode === "contract" ? "Contract" : "Full-Time";
}

export function formatContractBandwidthPill(
  hours?: string | null
): string | null {
  const normalized = normalizeContractHoursPerWeek(hours);
  if (!normalized) {
    return null;
  }
  const shortMatch = normalized.match(/^(\d+\+?\s*hrs\/week)/i);
  if (shortMatch?.[1]) {
    return shortMatch[1].replace("hrs/week", "hrs/wk");
  }
  return normalized.replace("hrs/week", "hrs/wk");
}

/** Founder-facing all-inclusive rate from contractor take-home net. */
export function getProvixInclusiveHourlyRate(
  netRate?: number | string | null
): number | null {
  const normalized = normalizeContractHourlyRate(netRate);
  if (normalized == null || normalized <= 0) {
    return null;
  }
  return Math.round(normalized * PROVIX_CONTRACT_RATE_MARKUP);
}

/** Founder-facing pill — all-inclusive Provix client rate, not net take-home. */
export function formatContractRatePill(
  rate?: number | string | null
): string | null {
  const inclusive = getProvixInclusiveHourlyRate(rate);
  if (inclusive == null) {
    return null;
  }
  return `$${inclusive}/hr`;
}

export const CONTRACT_DETAILS_REQUIRED_MESSAGE =
  "Select weekly bandwidth and a target payout rate greater than $0 / hr before opening contract work.";

/** When contract is open, weekly hours and a positive hourly rate are required. */
export function getContractDetailsValidationError(
  openToContract: boolean,
  hours?: string | null,
  rate?: number | string | null
): string | null {
  if (!openToContract) {
    return null;
  }

  const normalizedHours = normalizeContractHoursPerWeek(hours);
  const normalizedRate = normalizeContractHourlyRate(rate);
  if (!normalizedHours || normalizedRate == null || normalizedRate <= 0) {
    return CONTRACT_DETAILS_REQUIRED_MESSAGE;
  }

  return null;
}

export function formatMarketplaceAuditScoreBadge(
  auditScore: number | null | undefined
): string | null {
  if (typeof auditScore !== "number" || !Number.isFinite(auditScore)) {
    return null;
  }
  return `Score: ${Math.round(auditScore)}/100`;
}

export function marketplaceEngagementEmptyState(
  mode: MarketplaceEngagementMode
): string {
  return `No candidates currently open for ${marketplaceEngagementLabel(mode)} work with a verified 75+ audit score.`;
}

export function normalizeOpenToFulltime(value?: boolean | null): boolean {
  return value === true;
}

export function normalizeOpenToContract(value?: boolean | null): boolean {
  return value === true;
}

/**
 * Employer directory engagement match.
 * Explicit `false` hides the card on that tab; `null`/`undefined` default to open
 * so live 75+ profiles are not silently filtered out of Full-Time/Contract.
 */
export function resolveMarketplaceEngagementFlag(
  value?: boolean | null
): boolean {
  return value !== false;
}

export function normalizeContractHoursPerWeek(
  value?: string | null
): ContractHoursPerWeek | "" {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }
  if (CONTRACT_HOURS_VALUES.has(trimmed)) {
    return trimmed as ContractHoursPerWeek;
  }
  return LEGACY_CONTRACT_HOURS_MAP[trimmed] ?? "";
}

export function normalizeContractHourlyRate(
  value?: number | string | null
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value).trim(), 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed);
}

export function isOnlyUsingDiagnosticTools(
  openToFulltime: boolean,
  openToContract: boolean
): boolean {
  return !openToFulltime && !openToContract;
}

export type PreferenceAvailabilityTone = "emerald" | "zinc";

export type PreferenceAvailabilityPresentation = {
  label: "Full-Time + Contract" | "Full-Time" | "Contract" | "Diagnostic Only";
  tone: PreferenceAvailabilityTone;
  dotClass: string;
};

/** Pure preference label for sidebar / settings — no audit-score gating. */
export function getPreferenceAvailabilityPresentation(
  openToFulltime: boolean,
  openToContract: boolean
): PreferenceAvailabilityPresentation {
  if (openToFulltime && openToContract) {
    return {
      label: "Full-Time + Contract",
      tone: "emerald",
      dotClass: "bg-emerald-500",
    };
  }
  if (openToFulltime) {
    return {
      label: "Full-Time",
      tone: "emerald",
      dotClass: "bg-emerald-500",
    };
  }
  if (openToContract) {
    return {
      label: "Contract",
      tone: "emerald",
      dotClass: "bg-emerald-500",
    };
  }
  return {
    label: "Diagnostic Only",
    tone: "zinc",
    dotClass: "bg-zinc-500",
  };
}
