import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeIntroPipelineStatus } from "@/lib/intro-request-status";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";

export const INTRO_REQUEST_BASE_COLUMNS =
  "id, candidate_name, candidate_id, company_name, work_email, role_title, compensation_band, status, terms_accepted, terms_agreed_at, created_at";

export const INTRO_REQUEST_EXTENDED_COLUMNS = `${INTRO_REQUEST_BASE_COLUMNS}, agreed_first_year_compensation, candidate_bonus_allocated`;

export type IntroRequestRecord = {
  id: string;
  candidate_name: string | null;
  candidate_id: string;
  company_name: string | null;
  work_email: string | null;
  role_title: string;
  compensation_band: string | null;
  status: string;
  terms_accepted: boolean | null;
  terms_agreed_at: string | null;
  agreed_first_year_compensation: number | null;
  candidate_bonus_allocated: number | null;
  created_at: string;
};

function normalizeIntroRequestRow(
  row: Record<string, unknown>
): IntroRequestRecord {
  return {
    id: String(row.id ?? ""),
    candidate_name:
      typeof row.candidate_name === "string" ? row.candidate_name : null,
    candidate_id: String(row.candidate_id ?? ""),
    company_name:
      typeof row.company_name === "string" ? row.company_name : null,
    work_email: typeof row.work_email === "string" ? row.work_email : null,
    role_title: String(row.role_title ?? "Open role"),
    compensation_band:
      typeof row.compensation_band === "string" ? row.compensation_band : null,
    status: normalizeIntroPipelineStatus(
      typeof row.status === "string" ? row.status : null
    ),
    terms_accepted:
      typeof row.terms_accepted === "boolean" ? row.terms_accepted : null,
    terms_agreed_at:
      typeof row.terms_agreed_at === "string" ? row.terms_agreed_at : null,
    agreed_first_year_compensation:
      typeof row.agreed_first_year_compensation === "number"
        ? row.agreed_first_year_compensation
        : row.agreed_first_year_compensation != null
          ? Number.parseFloat(String(row.agreed_first_year_compensation)) ||
            null
          : null,
    candidate_bonus_allocated:
      typeof row.candidate_bonus_allocated === "number"
        ? row.candidate_bonus_allocated
        : row.candidate_bonus_allocated != null
          ? Number.parseFloat(String(row.candidate_bonus_allocated)) || null
          : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function fetchIntroRequests(
  dataClient: SupabaseClient
): Promise<{
  rows: IntroRequestRecord[];
  schemaWarning: string | null;
}> {
  const extendedResult = await dataClient
    .from("intro_requests")
    .select(INTRO_REQUEST_EXTENDED_COLUMNS)
    .order("created_at", { ascending: false });

  if (!extendedResult.error) {
    return {
      rows: (extendedResult.data ?? []).map((row) =>
        normalizeIntroRequestRow(row as Record<string, unknown>)
      ),
      schemaWarning: null,
    };
  }

  if (!isSupabaseSchemaError(extendedResult.error)) {
    throw extendedResult.error;
  }

  console.warn(
    "[admin/requests] Extended intro_requests columns unavailable; falling back to base columns:",
    extendedResult.error
  );

  const baseResult = await dataClient
    .from("intro_requests")
    .select(INTRO_REQUEST_BASE_COLUMNS)
    .order("created_at", { ascending: false });

  if (baseResult.error) {
    throw baseResult.error;
  }

  return {
    rows: (baseResult.data ?? []).map((row) =>
      normalizeIntroRequestRow(row as Record<string, unknown>)
    ),
    schemaWarning:
      "Placement compensation columns are missing. Run migration 0027 in Supabase to enable hire tracking and revenue metrics.",
  };
}

export async function updateIntroRequestRecord(
  dataClient: SupabaseClient,
  requestId: string,
  updatePayload: Record<string, unknown>
): Promise<{
  row: IntroRequestRecord;
  schemaWarning: string | null;
}> {
  const extendedResult = await dataClient
    .from("intro_requests")
    .update(updatePayload)
    .eq("id", requestId)
    .select(INTRO_REQUEST_EXTENDED_COLUMNS)
    .single();

  if (!extendedResult.error && extendedResult.data) {
    return {
      row: normalizeIntroRequestRow(
        extendedResult.data as Record<string, unknown>
      ),
      schemaWarning: null,
    };
  }

  if (!isSupabaseSchemaError(extendedResult.error)) {
    throw extendedResult.error;
  }

  const { agreed_first_year_compensation, candidate_bonus_allocated, ...rest } =
    updatePayload;

  if (
    agreed_first_year_compensation !== undefined ||
    candidate_bonus_allocated !== undefined
  ) {
    console.warn(
      "[admin/requests] Compensation columns unavailable during update:",
      extendedResult.error
    );
  }

  const baseResult = await dataClient
    .from("intro_requests")
    .update(rest)
    .eq("id", requestId)
    .select(INTRO_REQUEST_BASE_COLUMNS)
    .single();

  if (baseResult.error || !baseResult.data) {
    throw baseResult.error ?? extendedResult.error;
  }

  return {
    row: normalizeIntroRequestRow(baseResult.data as Record<string, unknown>),
    schemaWarning:
      "Status saved, but compensation columns are missing in Supabase. Run migration 0027 to persist hire revenue data.",
  };
}

export async function getIntroRequestById(
  dataClient: SupabaseClient,
  requestId: string
): Promise<IntroRequestRecord | null> {
  const extendedResult = await dataClient
    .from("intro_requests")
    .select(INTRO_REQUEST_EXTENDED_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();

  if (!extendedResult.error && extendedResult.data) {
    return normalizeIntroRequestRow(
      extendedResult.data as Record<string, unknown>
    );
  }

  if (extendedResult.error && !isSupabaseSchemaError(extendedResult.error)) {
    throw extendedResult.error;
  }

  const baseResult = await dataClient
    .from("intro_requests")
    .select(INTRO_REQUEST_BASE_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();

  if (baseResult.error) {
    throw baseResult.error;
  }

  return baseResult.data
    ? normalizeIntroRequestRow(baseResult.data as Record<string, unknown>)
    : null;
}
