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
import { coerceProfileText } from "./coerceprofiletext";

export function valueFromRow(
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
