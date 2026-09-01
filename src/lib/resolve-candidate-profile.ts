import type { SupabaseClient } from "@supabase/supabase-js";
import { educationFromProfileRow, hydrateRowsWithEducation } from "@/lib/talent-pool-profiles";
import {
  findMentionedColumn,
  isSupabaseSchemaError,
} from "@/lib/supabase-schema-errors";

export const PROFILE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AUTH_LINK_QUERY_COLUMNS = ["user_id"] as const;
const AUTH_LINK_ROW_COLUMNS = ["user_id", "auth_user_id", "auth_id"] as const;
const missingProfileFilterColumns = new Set<string>();

export function isProfileUuid(value: string | null | undefined): boolean {
  return typeof value === "string" && PROFILE_UUID_PATTERN.test(value.trim());
}

function asTrimmedId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return isProfileUuid(trimmed) ? trimmed : null;
}

export function uniqueCandidateIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => asTrimmedId(value)).filter(Boolean))] as string[];
}

export function profileRowLookupKeys(
  row: Record<string, unknown> | null | undefined
): string[] {
  if (!row) {
    return [];
  }

  const keys = new Set<string>();
  for (const column of ["id", ...AUTH_LINK_ROW_COLUMNS]) {
    const id = asTrimmedId(row[column]);
    if (id) {
      keys.add(id);
    }
  }
  return [...keys];
}

export function employerIdentityIds(
  userId: string,
  profile?: Record<string, unknown> | null
): string[] {
  return uniqueCandidateIds([userId, ...profileRowLookupKeys(profile)]);
}

export function resolvedProfileId(
  row: Record<string, unknown> | null | undefined,
  fallback?: string | null
): string | null {
  return asTrimmedId(row?.id) ?? asTrimmedId(fallback);
}

function withIdColumn(selectColumns: string): string {
  if (selectColumns.trim() === "*") {
    return "*";
  }

  const parts = selectColumns
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.includes("id")) {
    parts.unshift("id");
  }

  return parts.join(", ");
}

function isEmptyProfileValue(value: unknown): boolean {
  if (value == null) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim() === "";
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

function mergeProfileRows(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    if (isEmptyProfileValue(merged[key]) && !isEmptyProfileValue(value)) {
      merged[key] = value;
    }
  }
  return merged;
}

function indexProfileRow(
  map: Map<string, Record<string, unknown>>,
  row: Record<string, unknown> | null | undefined,
  extraKeys: string[] = []
): void {
  if (!row) {
    return;
  }

  const keys = [...profileRowLookupKeys(row), ...extraKeys];
  for (const key of keys) {
    const existing = map.get(key);
    map.set(key, existing ? mergeProfileRows(existing, row) : row);
  }
}

async function selectProfilesByColumn(
  supabase: SupabaseClient,
  column: string,
  ids: string[],
  selectColumns: string
): Promise<Record<string, unknown>[]> {
  if (ids.length === 0 || missingProfileFilterColumns.has(column)) {
    return [];
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(selectColumns)
    .in(column, ids);

  if (!error) {
    return ((data ?? []) as unknown) as Record<string, unknown>[];
  }

  if (
    isSupabaseSchemaError(error) &&
    (findMentionedColumn(error, [column]) ||
      error.message?.toLowerCase().includes(column))
  ) {
    missingProfileFilterColumns.add(column);
    return [];
  }

  console.error(
    `[resolve-candidate-profile] profiles lookup by ${column} failed:`,
    error.message
  );
  return [];
}

export async function fetchProfilesForCandidateIds(
  supabase: SupabaseClient,
  candidateIds: Array<string | null | undefined>,
  selectColumns = "*"
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  const ids = uniqueCandidateIds(candidateIds);
  if (ids.length === 0) {
    return map;
  }

  const select = withIdColumn(selectColumns);

  const byId = await selectProfilesByColumn(supabase, "id", ids, select);
  for (const row of byId) {
    indexProfileRow(map, row);
  }

  for (const column of AUTH_LINK_QUERY_COLUMNS) {
    const rows = await selectProfilesByColumn(
      supabase,
      column,
      ids,
      select === "*" ? "*" : withIdColumn(`${select}, ${column}`)
    );
    for (const row of rows) {
      const linkedId = asTrimmedId(row[column]);
      indexProfileRow(map, row, linkedId ? [linkedId] : []);
    }
  }

  const uniqueRows = [...new Map(
    [...map.values()].map((row) => [asTrimmedId(row.id) ?? JSON.stringify(row), row])
  ).values()];
  const hydratedRows = await hydrateRowsWithEducation(supabase, uniqueRows);
  const hydrated = new Map<string, Record<string, unknown>>();
  for (const row of hydratedRows) {
    indexProfileRow(hydrated, row);
  }

  return hydrated.size > 0 ? hydrated : map;
}

export async function fetchProfileForCandidateId(
  supabase: SupabaseClient,
  candidateId: string | null | undefined,
  selectColumns = "*"
): Promise<Record<string, unknown> | null> {
  const id = asTrimmedId(candidateId);
  if (!id) {
    return null;
  }

  const map = await fetchProfilesForCandidateIds(supabase, [id], selectColumns);
  return map.get(id) ?? null;
}

export async function employerHasApplicantForProfile(
  supabase: SupabaseClient,
  employerId: string,
  profile: Record<string, unknown> | null,
  extraIds: Array<string | null | undefined> = []
): Promise<boolean> {
  const ids = uniqueCandidateIds([
    ...profileRowLookupKeys(profile),
    ...extraIds,
  ]);
  if (ids.length === 0) {
    return false;
  }

  const { data: applications, error } = await supabase
    .from("job_applications")
    .select("job_id")
    .in("candidate_id", ids);

  if (error) {
    console.error(
      "[resolve-candidate-profile] job_applications lookup failed:",
      error.message
    );
    return false;
  }

  const jobIds = [
    ...new Set(
      (applications ?? [])
        .map((row) => asTrimmedId(row.job_id))
        .filter(Boolean)
    ),
  ] as string[];

  if (jobIds.length === 0) {
    return false;
  }

  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select("id")
    .in("id", jobIds)
    .eq("employer_id", employerId)
    .limit(1);

  if (jobsError) {
    console.error(
      "[resolve-candidate-profile] jobs ownership lookup failed:",
      jobsError.message
    );
    return false;
  }

  return (jobs ?? []).length > 0;
}

export function hydrateScreenCandidateFromProfile(
  candidate: {
    name?: string;
    title?: string;
    bio?: string;
    skills?: string[] | string;
    degree?: string;
    university?: string;
    major?: string;
    gpa?: string;
    graduation_year?: string;
    experience?: string;
    projects?: string[] | string;
    github_url?: string;
    github?: string;
  },
  row: Record<string, unknown> | null
) {
  if (!row) {
    return candidate;
  }

  const education = educationFromProfileRow(row);
  const profileSkills = Array.isArray(row.skills)
    ? row.skills.filter((skill): skill is string => typeof skill === "string")
    : [];
  const githubFromProfile =
    asTrimmedText(row.github_url) ||
    asTrimmedText(row.github) ||
    asTrimmedText(row.portfolio_url);

  const candidateSkills = Array.isArray(candidate.skills)
    ? candidate.skills
    : typeof candidate.skills === "string"
      ? candidate.skills
      : [];

  return {
    ...candidate,
    name: candidate.name || asTrimmedText(row.full_name) || asTrimmedText(row.name),
    title:
      candidate.title ||
      asTrimmedText(row.job_title) ||
      asTrimmedText(row.headline),
    bio: candidate.bio || asTrimmedText(row.bio),
    skills: profileSkills.length > 0 ? profileSkills : candidateSkills,
    degree: education.major || candidate.degree || education.university,
    university: education.university || candidate.university || "",
    major: education.major || candidate.major || "",
    gpa: education.gpa || candidate.gpa || "",
    graduation_year:
      education.graduationYear || candidate.graduation_year || "",
    experience:
      candidate.experience || asTrimmedText(row.experience_level),
    github_url: candidate.github_url || githubFromProfile || "",
    github: candidate.github || githubFromProfile || "",
  };
}

function asTrimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
