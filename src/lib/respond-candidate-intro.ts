import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CANDIDATE_INTRO_REQUEST_COLUMNS,
  CANDIDATE_INTRO_REQUEST_PUBLIC_COLUMNS,
  getCandidateIntroStatusUpdates,
  INTRO_REQUEST_LEGACY_SELECT_COLUMNS,
  isPendingCandidateIntroStatus,
  toCandidateIntroStatus,
  type CandidateIntroRequestRow,
  type CandidateIntroStatus,
} from "@/lib/candidate-intro-requests";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";

const INTRO_SELECT_COLUMN_SETS = [
  CANDIDATE_INTRO_REQUEST_PUBLIC_COLUMNS,
  INTRO_REQUEST_LEGACY_SELECT_COLUMNS,
] as const;

function isConstraintViolation(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23514" ||
    (error.message?.toLowerCase().includes("check constraint") ?? false)
  );
}

export async function fetchCandidateIntroRequestById(
  client: SupabaseClient,
  id: string,
  options?: {
    candidateId?: string;
    responseToken?: string | null;
  }
): Promise<CandidateIntroRequestRow | null> {
  if (options?.responseToken?.trim()) {
    const { data, error } = await client
      .from("intro_requests")
      .select(CANDIDATE_INTRO_REQUEST_COLUMNS)
      .eq("id", id)
      .eq("response_token", options.responseToken.trim())
      .maybeSingle();

    if (!error && data) {
      return data as unknown as CandidateIntroRequestRow;
    }

    if (error && !isSupabaseSchemaError(error)) {
      throw error;
    }

    return null;
  }

  for (const columns of INTRO_SELECT_COLUMN_SETS) {
    let query = client.from("intro_requests").select(columns).eq("id", id);

    if (options?.candidateId) {
      query = query.eq("candidate_id", options.candidateId);
    }

    const { data, error } = await query.maybeSingle();

    if (!error && data) {
      return data as unknown as CandidateIntroRequestRow;
    }

    if (error && !isSupabaseSchemaError(error)) {
      throw error;
    }
  }

  return null;
}

export async function updateCandidateIntroRequestStatus(
  client: SupabaseClient,
  id: string,
  action: "accept" | "decline"
): Promise<{ row: CandidateIntroRequestRow; status: CandidateIntroStatus } | null> {
  const statusCandidates = getCandidateIntroStatusUpdates(action);

  for (const storedStatus of statusCandidates) {
    for (const columns of INTRO_SELECT_COLUMN_SETS) {
      const { data, error } = await client
        .from("intro_requests")
        .update({ status: storedStatus })
        .eq("id", id)
        .select(columns)
        .maybeSingle();

      if (!error && data) {
        return {
          row: data as unknown as CandidateIntroRequestRow,
          status: toCandidateIntroStatus(storedStatus),
        };
      }

      if (error && isSupabaseSchemaError(error)) {
        continue;
      }

      if (error && isConstraintViolation(error)) {
        break;
      }

      if (error) {
        throw error;
      }
    }
  }

  return null;
}

export { isPendingCandidateIntroStatus };
