const GPA_MIN = 0;
const GPA_MAX = 4;

function isValidGpaNumber(value: number): boolean {
  return Number.isFinite(value) && value >= GPA_MIN && value <= GPA_MAX;
}

/**
 * Parses a 4.0-scale GPA. Values like "67", years, or percentages return null.
 */
export function parseGpa4Scale(value: unknown): number | null {
  if (typeof value === "number") {
    return isValidGpaNumber(value) ? value : null;
  }

  if (typeof value === "bigint") {
    const numeric = Number(value);
    return isValidGpaNumber(numeric) ? numeric : null;
  }

  if (value == null) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const overFour = text.match(
    /^(\d(?:\.\d{1,2})?)\s*\/\s*4(?:\.0+)?$/i
  );
  if (overFour) {
    const numeric = Number.parseFloat(overFour[1]);
    return isValidGpaNumber(numeric) ? numeric : null;
  }

  const stripped = text
    .replace(/^(?:gpa|grade\s*point(?:\s*average)?)[:\s-]*/i, "")
    .trim();

  if (/^\d+(?:\.\d+)?$/.test(stripped)) {
    const numeric = Number.parseFloat(stripped);
    return isValidGpaNumber(numeric) ? numeric : null;
  }

  if (/^[0-4]\.$/.test(stripped)) {
    return Number.parseFloat(stripped);
  }

  const token = stripped.match(/(?:^|[^\d.])([0-4]\.\d{1,2})(?=$|[^\d.])/);
  if (!token) {
    return null;
  }

  const numeric = Number.parseFloat(token[1]);
  return isValidGpaNumber(numeric) ? numeric : null;
}

/**
 * Canonical 4.0-scale display, e.g. "4.0" or "3.8". Invalid data becomes "".
 */
export function formatGpa(value: unknown): string {
  const numeric = parseGpa4Scale(value);
  if (numeric == null) {
    return "";
  }

  const rounded = Math.round(numeric * 100) / 100;
  const tenths = Math.round(rounded * 10) / 10;
  if (Math.abs(rounded - tenths) < 0.001) {
    return tenths.toFixed(1);
  }

  return rounded.toFixed(2);
}

/** True while the candidate is still typing a 4.0-scale GPA. */
export function isGpaDraft(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") {
    return true;
  }

  return /^(?:[0-4](?:\.\d{0,2})?)$/.test(trimmed);
}
