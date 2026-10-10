import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDeterministicEmployerMatch,
  type EmployerMatchCandidatePayload,
} from "@/lib/employer-match";
import {
  clampMatchPercentage,
  normalizeMatchResult,
  type MatchCandidatePayload,
  type MatchJobPayload,
  type MatchResult,
} from "@/lib/match-heuristic";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";
import { readJsonResponse } from "@/lib/read-json-response";

export function resolveMatchInsight(
  raw: unknown,
  candidate: MatchCandidatePayload,
  job: MatchJobPayload
): MatchResult {
  const deterministic = buildDeterministicEmployerMatch(
    candidate as EmployerMatchCandidatePayload,
    job
  );

  if (raw && typeof raw === "object" && !("error" in (raw as object))) {
    const normalized = normalizeMatchResult(raw);
    const reasoning = normalized.reasoning.trim();
    return {
      // Always keep TypeScript-computed score + skill lists; LLM may only narrate.
      match_percentage: deterministic.match_percentage,
      reasoning: reasoning || deterministic.reasoning,
      matching_skills: deterministic.matching_skills,
      missing_skills: deterministic.missing_skills,
    };
  }

  return deterministic;
}

export async function loadCachedTalentMatchScores(
  supabase: SupabaseClient,
  employerId: string,
  jobId: string | null
): Promise<Record<string, MatchResult>> {
  let query = supabase
    .from("talent_match_scores")
    .select(
      "candidate_id, match_percentage, reasoning, matching_skills, missing_skills"
    )
    .eq("employer_id", employerId);

  query = jobId ? query.eq("job_id", jobId) : query.is("job_id", null);

  const { data, error } = await query;

  if (error) {
    if (!isSupabaseSchemaError(error)) {
      console.warn("Failed to load talent match scores:", error.message);
    }
    return {};
  }

  const cachedByCandidate: Record<string, MatchResult> = {};
  for (const row of data ?? []) {
    if (!row.candidate_id) {
      continue;
    }

    cachedByCandidate[row.candidate_id] = {
      match_percentage: clampMatchPercentage(row.match_percentage),
      reasoning: row.reasoning ?? "",
      matching_skills: row.matching_skills ?? [],
      missing_skills: row.missing_skills ?? [],
    };
  }

  return cachedByCandidate;
}

export async function fetchTalentMatchInsight(
  candidate: MatchCandidatePayload,
  job: MatchJobPayload
): Promise<MatchResult> {
  const deterministic = buildDeterministicEmployerMatch(
    candidate as EmployerMatchCandidatePayload,
    job
  );

  try {
    const response = await fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate, job }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      return deterministic;
    }

    const raw = (await readJsonResponse(response)) as unknown;
    return resolveMatchInsight(raw, candidate, job);
  } catch (error) {
    console.warn("Talent match API unavailable, using fallback.", error);
    return deterministic;
  }
}

export async function saveTalentMatchScore(
  supabase: SupabaseClient,
  input: {
    employerId: string;
    candidateId: string;
    jobId: string | null;
    insight: MatchResult;
  }
): Promise<void> {
  const { error } = await supabase.from("talent_match_scores").upsert(
    {
      employer_id: input.employerId,
      candidate_id: input.candidateId,
      job_id: input.jobId,
      match_percentage: clampMatchPercentage(input.insight.match_percentage),
      reasoning: input.insight.reasoning,
      matching_skills: input.insight.matching_skills,
      missing_skills: input.insight.missing_skills,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employer_id,candidate_id,job_id" }
  );

  if (error && !isSupabaseSchemaError(error)) {
    console.warn("Failed to save talent match score:", error.message);
  }
}
