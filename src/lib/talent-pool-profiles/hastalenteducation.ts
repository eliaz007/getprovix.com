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

export function hasTalentEducation(education: TalentPoolEducation): boolean {
  if (education.isSelfTaught) {
    return true;
  }

  return [
    education.university,
    education.major,
    formatGpa(education.gpa),
    education.graduationYear,
  ].some(Boolean);
}
