import type { SupabaseClient } from "@supabase/supabase-js";
import { formatGpa } from "@/lib/gpa";
import {
  parseEducationFromProfileRow,
  parseIsSelfTaught,
} from "@/lib/candidate-education";
import { isEmployerRole } from "@/lib/dashboard-account";
import {
  explainPublishedVerifiedCandidateRejection,
  isPublishedVerifiedCandidateProfile,
} from "@/lib/published-candidate-profile";
import {
  findMentionedColumn,
  isSupabaseSchemaError,
  schemaErrorMentionsColumn,
} from "@/lib/supabase-schema-errors";
import { PROFILE_EDUCATION_COLUMNS } from "./profile-education-columns";
import { selectProfilesByIds } from "./selectprofilesbyids";

export async function selectProfileEducationRows(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Record<string, unknown>[]> {
  const uniqueIds = [...new Set(ids.map((id: (typeof ids)[number]) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return [];
  }

  let columns: string[] = [...PROFILE_EDUCATION_COLUMNS];

  for (let attempt = 0; attempt < PROFILE_EDUCATION_COLUMNS.length; attempt += 1) {
    const rows = await selectProfilesByIds(supabase, uniqueIds, columns);
    if (rows.length > 0) {
      return rows;
    }

    const { error } = await supabase
      .from("profiles")
      .select(columns.join(", "))
      .in("id", uniqueIds)
      .limit(1);

    if (!error) {
      return [];
    }

    if (!isSupabaseSchemaError(error)) {
      console.error("Talent pool education select failed:", error);
      break;
    }

    const droppable = columns.filter((column: (typeof columns)[number]) => column !== "id");
    const mentioned = findMentionedColumn(error, droppable);
    if (mentioned) {
      columns = columns.filter((column: (typeof columns)[number]) => column !== mentioned);
      continue;
    }

    break;
  }

  const fallback = await selectProfilesByIds(supabase, uniqueIds, ["*"]);
  if (fallback.length > 0) {
    return fallback;
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
