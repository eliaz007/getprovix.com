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
