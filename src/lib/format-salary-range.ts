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

/**
 * Normalizes free-text salary ranges into "$80,000 - $100,000 / yr".
 * Handles inputs like "80,000-100,000", "80k-100k", and "$95000".
 */
export function formatSalaryRange(value: string | null | undefined): string {
  const raw = value?.trim() ?? "";
  if (!raw) {
    return "";
  }

  const withoutSuffix = raw.replace(/\s*\/\s*yr\s*$/i, "").trim();
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

  if (amounts.length === 1) {
    return `${formatSalaryAmount(amounts[0])} / yr`;
  }

  const [low, high] = amounts;
  const orderedLow = Math.min(low, high);
  const orderedHigh = Math.max(low, high);

  return `${formatSalaryAmount(orderedLow)} - ${formatSalaryAmount(orderedHigh)} / yr`;
}
