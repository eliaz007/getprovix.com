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
import { profileRowLookupIds } from "./profilerowlookupids";
import { selectProfileEducationRows } from "./selectprofileeducationrows";
import { mergeEducationIntoProfileRows } from "./mergeeducationintoprofilerows";

export async function hydrateRowsWithEducation<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  rows: T[]
): Promise<T[]> {
  const ids = rows.flatMap((row: (typeof rows)[number]) => profileRowLookupIds(row));
  const educationRows = await selectProfileEducationRows(supabase, ids);
  return mergeEducationIntoProfileRows(rows, educationRows);
}
