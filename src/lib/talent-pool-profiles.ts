import type { SupabaseClient } from "@supabase/supabase-js";
import { isEmployerRole } from "@/lib/dashboard-account";
import { profileRowIsPublicToEmployers } from "@/lib/opportunities-metrics";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";

export type TalentPoolProfileRow = {
  id?: string | null;
  role?: string | null;
  is_visible_in_pool?: boolean | string | number | null;
  visible_to_employers?: boolean | string | number | null;
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
  "role",
  "is_visible_in_pool",
] as const;

const OPTIONAL_SELECT_COLUMNS = [
  "name",
  "first_name",
  "last_name",
  "experience_level",
  "email",
  "visible_to_employers",
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

function isEmployerProfileRow(row: TalentPoolProfileRow): boolean {
  return isEmployerRole(
    typeof row.role === "string" ? row.role : null
  );
}

function filterTalentPoolRows(rows: TalentPoolProfileRow[]): TalentPoolProfileRow[] {
  return rows.filter(
    (row) => profileRowIsPublicToEmployers(row) && !isEmployerProfileRow(row)
  );
}

export async function fetchEmployerTalentPoolProfiles(
  supabase: SupabaseClient
): Promise<{ data: TalentPoolProfileRow[]; error: null } | { data: []; error: unknown }> {
  let columns = [...CORE_SELECT_COLUMNS, ...OPTIONAL_SELECT_COLUMNS];
  let visibilityColumn: "is_visible_in_pool" | "visible_to_employers" =
    "is_visible_in_pool";
  let excludeEmployerRoles = true;
  const maxAttempts = OPTIONAL_SELECT_COLUMNS.length + 6;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!columns.includes(visibilityColumn)) {
      if (
        visibilityColumn === "is_visible_in_pool" &&
        !columns.includes("visible_to_employers")
      ) {
        columns = [...columns, "visible_to_employers"];
        visibilityColumn = "visible_to_employers";
        continue;
      }

      console.warn(
        "Talent pool fetch skipped: no opt-in visibility column available."
      );
      return { data: [], error: null };
    }

    let query = supabase
      .from("profiles")
      .select(columns.join(", "))
      .eq(visibilityColumn, true);

    if (excludeEmployerRoles && columns.includes("role")) {
      query = query.not("role", "in", "(employer,business)");
    }

    const { data, error } = await query;

    if (!error) {
      const rows = (data ?? []) as unknown as TalentPoolProfileRow[];
      return {
        data: filterTalentPoolRows(rows),
        error: null,
      };
    }

    if (!isSupabaseSchemaError(error)) {
      console.error("Failed to fetch talent pool profiles:", error);
      return { data: [], error };
    }

    if (
      visibilityColumn === "is_visible_in_pool" &&
      mentionsColumn(error, "is_visible_in_pool")
    ) {
      columns = columns.filter((column) => column !== "is_visible_in_pool");
      if (!columns.includes("visible_to_employers")) {
        columns = [...columns, "visible_to_employers"];
      }
      visibilityColumn = "visible_to_employers";
      continue;
    }

    if (
      visibilityColumn === "visible_to_employers" &&
      mentionsColumn(error, "visible_to_employers")
    ) {
      console.warn(
        "Talent pool fetch skipped: visibility columns are unavailable."
      );
      return { data: [], error: null };
    }

    if (excludeEmployerRoles && mentionsColumn(error, "role")) {
      excludeEmployerRoles = false;
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
