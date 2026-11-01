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
import { PROFILE_ID_COLUMNS } from "./profile-id-columns";
import { missingTalentPoolFilterColumns } from "./missingtalentpoolfiltercolumns";

export async function selectProfilesByIds(
  supabase: SupabaseClient,
  ids: string[],
  columns: string[]
): Promise<Record<string, unknown>[]> {
  const uniqueIds = [...new Set(ids.map((id: (typeof ids)[number]) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return [];
  }

  const collected: Record<string, unknown>[] = [];

  for (const column of PROFILE_ID_COLUMNS) {
    if (missingTalentPoolFilterColumns.has(column)) {
      continue;
    }

    const selectColumns =
      columns[0] === "*"
        ? ["*"]
        : columns.includes(column)
          ? columns
          : [...columns, column];

    const { data, error } = await supabase
      .from("profiles")
      .select(selectColumns.join(", "))
      .in(column, uniqueIds);

    if (!error) {
      collected.push(
        ...(((data ?? []) as unknown) as Record<string, unknown>[])
      );
      continue;
    }

    if (
      isSupabaseSchemaError(error) &&
      (findMentionedColumn(error, [column]) ||
        error.message?.toLowerCase().includes(column))
    ) {
      missingTalentPoolFilterColumns.add(column);
      continue;
    }

    if (!isSupabaseSchemaError(error)) {
      console.error(
        `Talent pool education select by ${column} failed:`,
        error
      );
    }
  }

  return collected;
}
