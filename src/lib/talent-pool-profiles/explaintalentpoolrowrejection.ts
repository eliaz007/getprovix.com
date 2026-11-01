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
import type { TalentPoolProfileRow } from "./talentpoolprofilerow";
import { isEmployerProfileRow } from "./isemployerprofilerow";

export function explainTalentPoolRowRejection(
  row: TalentPoolProfileRow
): string | null {
  if (isEmployerProfileRow(row)) {
    return `isEmployerProfileRow (role=${String(row.role)})`;
  }

  return explainPublishedVerifiedCandidateRejection(row);
}
