/** Returns a stored integrity score from Supabase, or null when none exists. */
export function resolveCandidateScore(candidate: {
  integrity_score?: number | null;
  execution_score?: number | null;
}): number | null {
  if (typeof candidate.integrity_score === "number") {
    return Math.round(candidate.integrity_score);
  }

  if (typeof candidate.execution_score === "number") {
    return Math.round(candidate.execution_score);
  }

  return null;
}
