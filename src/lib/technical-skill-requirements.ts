/** Soft descriptors / tenure asks that should not suppress technical match %. */
const SOFT_SKILL_BUZZWORDS = new Set([
  "agile",
  "scrum",
  "kanban",
  "fast",
  "fast-paced",
  "proactive",
  "passionate",
  "self-starter",
  "self starter",
  "team player",
  "collaborative",
  "communication",
  "excellent communication",
  "strong communication",
  "detail-oriented",
  "detail oriented",
  "ownership",
  "flexible",
  "adaptable",
  "motivated",
  "driven",
  "hardworking",
  "hard-working",
  "culture fit",
  "growth mindset",
]);

const TENURE_ONLY_PATTERN =
  /^(?:\d+\s*(?:\+|plus)?\s*(?:-\s*\d+)?\s*)?(?:\+)?\s*years?(?:\s+of\s+experience)?$/i;

function uniqueDisplayList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

/**
 * Soft buzzwords and bare tenure requirements ("3+ years", "Agile", "Fast")
 * are excluded from technical overlap scoring and missing-skill reprimands.
 */
export function isSoftOrTenureRequirement(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (SOFT_SKILL_BUZZWORDS.has(normalized)) {
    return true;
  }

  if (TENURE_ONLY_PATTERN.test(normalized)) {
    return true;
  }

  // "3+ years experience" / "5 years" with no tech keyword
  if (
    /\b\d+\+?\s*years?\b/i.test(normalized) &&
    !/\b(react|typescript|javascript|python|java|golang|go|rust|node|aws|gcp|azure|sql|postgres|kubernetes|docker|next\.?js|vue|angular|rails|django|swift|kotlin)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  return false;
}

export function filterTechnicalRequirements(requirements: string[]): string[] {
  return uniqueDisplayList(requirements).filter(
    (requirement) => !isSoftOrTenureRequirement(requirement)
  );
}
