export type CompensationPeriod = "yr" | "hr";

function parseSalaryAmount(part: string): number | null {
  const trimmed = part.trim();
  if (!trimmed) {
    return null;
  }

  const kMatch = trimmed.match(/^[\$]?\s*(\d+(?:\.\d+)?)\s*[kK]\b/);
  if (kMatch) {
    return Math.round(Number.parseFloat(kMatch[1]) * 1000);
  }

  const mMatch = trimmed.match(/^[\$]?\s*(\d+(?:\.\d+)?)\s*[mM]\b/);
  if (mMatch) {
    return Math.round(Number.parseFloat(mMatch[1]) * 1_000_000);
  }

  const numeric = trimmed.replace(/[^\d.]/g, "");
  if (!numeric) {
    return null;
  }

  const parsed = Number.parseFloat(numeric);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function formatSalaryAmount(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

function stripCompensationSuffix(raw: string): string {
  return raw
    .replace(/\s*\/\s*(?:yr|year|hr|hour)\s*$/i, "")
    .replace(/\s+per\s+(?:year|hour)\s*$/i, "")
    .trim();
}

/**
 * Detect whether a free-text compensation string is hourly or annual.
 * Prefers explicit /hr|/yr markers; otherwise treats small bare amounts as hourly.
 */
export function detectCompensationPeriod(
  raw: string,
  amounts: number[] = []
): CompensationPeriod {
  if (
    /\b\/\s*hr\b|\b\/\s*hour\b|\bper\s*hour\b|\bhourly\b/i.test(raw)
  ) {
    return "hr";
  }
  if (
    /\b\/\s*yr\b|\b\/\s*year\b|\bper\s*year\b|\bannual(?:ly)?\b|\bsalary\b/i.test(
      raw
    )
  ) {
    return "yr";
  }
  if (/\d\s*[kK]\b|\d\s*[mM]\b/.test(raw)) {
    return "yr";
  }
  // Contract-style bare rates like "$200" or "$80-$120" are hourly, not yearly.
  if (
    amounts.length > 0 &&
    amounts.every((amount) => amount > 0 && amount < 500)
  ) {
    return "hr";
  }
  return "yr";
}

export type FormatSalaryRangeOptions = {
  /** Force /hr or /yr when the caller already knows the engagement type. */
  period?: CompensationPeriod;
};

/**
 * Normalizes free-text compensation into "$80,000 - $100,000 / yr"
 * or "$80 - $120 / hr".
 */
export function formatSalaryRange(
  value: string | null | undefined,
  options?: FormatSalaryRangeOptions
): string {
  const raw = value?.trim() ?? "";
  if (!raw) {
    return "";
  }

  const withoutSuffix = stripCompensationSuffix(raw);
  const rangeParts = withoutSuffix
    .split(/\s*(?:-|–|—|\sto\s)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (rangeParts.length === 0) {
    return raw;
  }

  const amounts = rangeParts
    .map(parseSalaryAmount)
    .filter((amount): amount is number => amount !== null);

  if (amounts.length === 0) {
    return raw;
  }

  const period =
    options?.period ?? detectCompensationPeriod(raw, amounts);
  const suffix = period === "hr" ? "/ hr" : "/ yr";

  if (amounts.length === 1) {
    return `${formatSalaryAmount(amounts[0])} ${suffix}`;
  }

  const [low, high] = amounts;
  const orderedLow = Math.min(low, high);
  const orderedHigh = Math.max(low, high);

  return `${formatSalaryAmount(orderedLow)} - ${formatSalaryAmount(orderedHigh)} ${suffix}`;
}

/**
 * Prefer explicit hourly_rate_range for contract roles; otherwise format
 * salary_range with the correct /hr or /yr period.
 */
export function formatJobCompensation(job: {
  salary_range?: string | null;
  hourly_rate_range?: string | null;
  employment_type?: string | null;
}): string {
  const hourly = job.hourly_rate_range?.trim();
  if (hourly) {
    return formatSalaryRange(hourly, { period: "hr" });
  }

  const salary = job.salary_range?.trim();
  if (!salary) {
    return "";
  }

  // Contract listings often store bare hourly targets in salary_range
  // (e.g. "$200") without an /hr suffix — detectCompensationPeriod handles that.
  return formatSalaryRange(salary);
}
