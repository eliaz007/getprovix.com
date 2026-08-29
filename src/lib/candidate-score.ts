import { clampScore0to100 } from "@/lib/score-scale";

/** Returns a stored integrity score from Supabase, or null when none exists. */
export function resolveCandidateScore(candidate: {
  integrity_score?: number | null;
  execution_score?: number | null;
}): number | null {
  if (typeof candidate.integrity_score === "number") {
    return clampScore0to100(candidate.integrity_score);
  }

  if (typeof candidate.execution_score === "number") {
    return clampScore0to100(candidate.execution_score);
  }

  return null;
}
