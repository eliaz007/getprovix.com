import type { SupabaseClient } from "@supabase/supabase-js";
import { isVisibleToEmployers } from "@/lib/opportunities-metrics";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";

export type TalentPoolProfileRow = {
  id?: string | null;
  is_visible_in_pool?: boolean | null;
  role_type?: string | null;
  [key: string]: unknown;
};

const CORE_SELECT_COLUMNS = [
  "id",
  "full_name",
  "job_title",
  "bio",
  "skills",
  "portfolio_url",
  "experience_level",
  "role",
  "is_visible_in_pool",
  "email",
] as const;

const OPTIONAL_SELECT_COLUMNS = [
  "name",
  "first_name",
  "last_name",
  "headline",
  "youtube_url",
  "availability_status",
  "availability",
  "major",
  "degree",
  "university",
  "school",
  "codename_alias",
  "country",
  "timezone",
  "work_preference",
  "role_type",
  "phone",
  "linkedin_url",
  "contact_email",
  "integrity_score",
] as const;

function mentionsColumn(
  error: { message?: string },
  column: string
): boolean {
  const message = error.message?.toLowerCase() ?? "";
  return message.includes(column.toLowerCase());
}

function filterVisiblePoolRows(rows: TalentPoolProfileRow[]): TalentPoolProfileRow[] {
  return rows.filter((row) => isVisibleToEmployers(row.is_visible_in_pool));
}

export async function fetchEmployerTalentPoolProfiles(
  supabase: SupabaseClient
): Promise<{ data: TalentPoolProfileRow[]; error: null } | { data: []; error: unknown }> {
  let columns = [...CORE_SELECT_COLUMNS, ...OPTIONAL_SELECT_COLUMNS];
  let filterByVisibility = true;
  const maxAttempts = OPTIONAL_SELECT_COLUMNS.length + 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let query = supabase.from("profiles").select(columns.join(", "));

    if (filterByVisibility) {
      query = query.eq("is_visible_in_pool", true);
    }

    const { data, error } = await query;

    if (!error) {
      const rows = (data ?? []) as unknown as TalentPoolProfileRow[];
      return {
        data: filterByVisibility ? rows : filterVisiblePoolRows(rows),
        error: null,
      };
    }

    if (!isSupabaseSchemaError(error)) {
      console.error("Failed to fetch talent pool profiles:", error);
      return { data: [], error };
    }

    if (filterByVisibility && mentionsColumn(error, "is_visible_in_pool")) {
      filterByVisibility = false;
      continue;
    }

    const mentionedOptional = OPTIONAL_SELECT_COLUMNS.find(
      (column) => columns.includes(column) && mentionsColumn(error, column)
    );
    if (mentionedOptional) {
      columns = columns.filter((column) => column !== mentionedOptional);
      continue;
    }

    const removableOptional = [...OPTIONAL_SELECT_COLUMNS]
      .reverse()
      .find((column) => columns.includes(column));
    if (removableOptional) {
      columns = columns.filter((column) => column !== removableOptional);
      continue;
    }

    console.warn(
      "Talent pool fetch skipped due to schema mismatch:",
      error.message
    );
    return { data: [], error: null };
  }

  return { data: [], error: null };
}
