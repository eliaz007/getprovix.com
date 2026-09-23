export function normalizeCompanyName(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function isMissingCompanyName(value: string | null | undefined): boolean {
  const normalized = normalizeCompanyName(value);
  return normalized.length === 0 || normalized.toLowerCase() === "company name";
}

export function employerCompanyLabel(value: string | null | undefined): string {
  const normalized = normalizeCompanyName(value);
  return isMissingCompanyName(normalized) ? "Add Company Name" : normalized;
}
