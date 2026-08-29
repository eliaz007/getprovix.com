/** True 0–100 integer scale for screening, match, and audit scores. */
export function clampScore0to100(value: unknown, fallback = 0): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, Math.round(numeric)));
}

export function scoreBarWidthPercent(score: number): string {
  return `${clampScore0to100(score)}%`;
}
