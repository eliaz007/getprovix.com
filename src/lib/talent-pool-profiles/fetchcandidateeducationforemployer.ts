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
import type { TalentPoolEducation } from "./talentpooleducation";
import { educationFromProfileRow } from "./educationfromprofilerow";
import { mergeProfileRowFields } from "./mergeprofilerowfields";
import { selectProfileEducationRows } from "./selectprofileeducationrows";

export async function fetchCandidateEducationForEmployer(
  supabase: SupabaseClient,
  profileId: string
): Promise<TalentPoolEducation | null> {
  const id = profileId.trim();
  if (!id) {
    return null;
  }

  const rows = await selectProfileEducationRows(supabase, [id]);
  if (rows.length === 0) {
    return null;
  }

  const merged = rows.reduce(
    (current, row) => mergeProfileRowFields(current, row),
    {} as Record<string, unknown>
  );

  return educationFromProfileRow(merged);
}
