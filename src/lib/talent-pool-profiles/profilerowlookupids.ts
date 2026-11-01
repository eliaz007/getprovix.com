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
import { coerceProfileText } from "./coerceprofiletext";

export function profileRowLookupIds(row: Record<string, unknown>): string[] {
  return PROFILE_ID_COLUMNS.map((column: (typeof PROFILE_ID_COLUMNS)[number]) => coerceProfileText(row[column])).filter(
    Boolean
  );
}
