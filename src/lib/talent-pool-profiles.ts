import type { SupabaseClient } from "@supabase/supabase-js";
import { isEmployerRole } from "@/lib/dashboard-account";
import { profileRowIsPublicToEmployers } from "@/lib/opportunities-metrics";
import {
  findMentionedColumn,
  isSupabaseSchemaError,
  schemaErrorMentionsColumn,
} from "@/lib/supabase-schema-errors";

export type TalentPoolEducation = {
  university: string;
  major: string;
  gpa: string;
  graduationYear: string;
};

const UNIVERSITY_KEYS = [
  "university",
  "school",
  "college",
  "institution",
  "school_name",
] as const;

const MAJOR_KEYS = ["major", "degree", "specialization", "intended_major"] as const;

const GPA_KEYS = ["gpa", "grade_point_average", "gpa_value"] as const;

const GRADUATION_YEAR_KEYS = [
  "graduation_year",
  "graduationYear",
  "grad_year",
  "gradYear",
] as const;

export const PROFILE_EDUCATION_COLUMNS = [
  "id",
  "university",
  "school",
  "major",
  "degree",
  "gpa",
  "graduation_year",
] as const;

function coerceProfileText(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return "";
}

function valueFromRow(
  row: Record<string, unknown>,
  keys: readonly string[]
): string {
  const lowerEntries = new Map(
    Object.entries(row).map(([key, value]) => [key.toLowerCase(), value])
  );

  for (const key of keys) {
    const direct = coerceProfileText(row[key]);
    if (direct) {
      return direct;
    }

    const lowered = coerceProfileText(lowerEntries.get(key.toLowerCase()));
    if (lowered) {
      return lowered;
    }
  }

  return "";
}

export function educationFromProfileRow(
  row: Record<string, unknown> | null | undefined
): TalentPoolEducation {
  if (!row) {
    return {
      university: "",
      major: "",
      gpa: "",
      graduationYear: "",
    };
  }

  return {
    university: valueFromRow(row, UNIVERSITY_KEYS),
    major: valueFromRow(row, MAJOR_KEYS),
    gpa: valueFromRow(row, GPA_KEYS),
    graduationYear: valueFromRow(row, GRADUATION_YEAR_KEYS),
  };
}

export function resolveTalentProfileId(candidate: {
  id?: string | null;
  profileId?: string | null;
}): string {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  for (const value of [candidate.profileId, candidate.id]) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (uuidPattern.test(trimmed)) {
      return trimmed;
    }
  }

  return (
    (typeof candidate.profileId === "string" ? candidate.profileId.trim() : "") ||
    (typeof candidate.id === "string" ? candidate.id.trim() : "")
  );
}

export function candidateEducationFields(
  candidate: TalentPoolEducation
): TalentPoolEducation {
  return {
    university: candidate.university,
    major: candidate.major,
    gpa: candidate.gpa,
    graduationYear: candidate.graduationYear,
  };
}

export function hasTalentEducation(education: TalentPoolEducation): boolean {
  return [
    education.university,
    education.major,
    education.gpa,
    education.graduationYear,
  ].some(Boolean);
}

export function mergeTalentEducation(
  current: TalentPoolEducation,
  incoming: TalentPoolEducation
): TalentPoolEducation {
  return {
    university: incoming.university || current.university,
    major: incoming.major || current.major,
    gpa: incoming.gpa || current.gpa,
    graduationYear: incoming.graduationYear || current.graduationYear,
  };
}

async function selectProfileEducationRows(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Record<string, unknown>[]> {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return [];
  }

  let columns: string[] = [...PROFILE_EDUCATION_COLUMNS];

  for (let attempt = 0; attempt < PROFILE_EDUCATION_COLUMNS.length; attempt += 1) {
    const { data, error } = await supabase
      .from("profiles")
      .select(columns.join(", "))
      .in("id", uniqueIds);

    if (!error) {
      return (data ?? []) as unknown as Record<string, unknown>[];
    }

    if (!isSupabaseSchemaError(error)) {
      console.error("Talent pool education select failed:", error);
      break;
    }

    const droppable = columns.filter((column) => column !== "id");
    const mentioned = findMentionedColumn(error, droppable);
    if (mentioned) {
      columns = columns.filter((column) => column !== mentioned);
      continue;
    }

    break;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .in("id", uniqueIds);

  if (error) {
    if (!isSupabaseSchemaError(error)) {
      console.error("Talent pool education fallback fetch failed:", error);
    }
    return [];
  }

  return (data ?? []) as Record<string, unknown>[];
}

function mergeEducationIntoProfileRows(
  rows: TalentPoolProfileRow[],
  educationRows: Record<string, unknown>[]
): TalentPoolProfileRow[] {
  if (educationRows.length === 0) {
    return rows;
  }

  const educationById = new Map<string, Record<string, unknown>>();
  for (const row of educationRows) {
    const id = coerceProfileText(row.id);
    if (id) {
      educationById.set(id, row);
    }
  }

  return rows.map((row) => {
    const id = coerceProfileText(row.id);
    const extra = id ? educationById.get(id) : undefined;
    return extra ? { ...row, ...extra } : row;
  });
}

export async function fetchCandidateEducationForEmployer(
  supabase: SupabaseClient,
  profileId: string
): Promise<TalentPoolEducation | null> {
  const id = profileId.trim();
  if (!id) {
    return null;
  }

  const rows = await selectProfileEducationRows(supabase, [id]);
  const row = rows[0];
  if (!row) {
    return null;
  }

  return educationFromProfileRow(row);
}

export type TalentPoolProfileRow = {
  id?: string | null;
  role?: string | null;
  is_visible_in_pool?: boolean | string | number | null;
  visible_to_employers?: boolean | string | number | null;
  role_type?: string | null;
  [key: string]: unknown;
};

const VISIBILITY_COLUMNS = [
  "is_visible_in_pool",
  "visible_to_employers",
] as const;

function isEmployerProfileRow(row: TalentPoolProfileRow): boolean {
  return isEmployerRole(typeof row.role === "string" ? row.role : null);
}

function filterTalentPoolRows(
  rows: TalentPoolProfileRow[]
): TalentPoolProfileRow[] {
  return rows.filter(
    (row) => profileRowIsPublicToEmployers(row) && !isEmployerProfileRow(row)
  );
}

function cacheBustTalentPoolQuery<
  T extends { neq: (column: string, value: string) => T },
>(query: T): T {
  const nonce =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `talent-pool-${Date.now()}`;
  return query.neq("id", nonce);
}

export async function fetchEmployerTalentPoolProfiles(
  supabase: SupabaseClient
): Promise<
  { data: TalentPoolProfileRow[]; error: null } | { data: []; error: unknown }
> {
  for (const visibilityColumn of VISIBILITY_COLUMNS) {
    for (const excludeEmployerRoles of [true, false]) {
      let query = supabase
        .from("profiles")
        .select("*")
        .eq(visibilityColumn, true);

      query = cacheBustTalentPoolQuery(query);

      if (excludeEmployerRoles) {
        query = query.not("role", "in", "(employer,business)");
      }

      const { data, error } = await query;

      if (!error) {
        const filtered = filterTalentPoolRows(
          (data ?? []) as TalentPoolProfileRow[]
        );
        const ids = filtered
          .map((row) => coerceProfileText(row.id))
          .filter(Boolean);
        const educationRows = await selectProfileEducationRows(supabase, ids);

        return {
          data: mergeEducationIntoProfileRows(filtered, educationRows),
          error: null,
        };
      }

      if (!isSupabaseSchemaError(error)) {
        console.error("Failed to fetch talent pool profiles:", error);
        return { data: [], error };
      }

      if (schemaErrorMentionsColumn(error, visibilityColumn)) {
        break;
      }

      if (
        excludeEmployerRoles &&
        schemaErrorMentionsColumn(error, "role")
      ) {
        continue;
      }

      console.warn(
        "Talent pool fetch skipped due to schema mismatch:",
        error.message
      );
      return { data: [], error: null };
    }
  }

  return { data: [], error: null };
}
