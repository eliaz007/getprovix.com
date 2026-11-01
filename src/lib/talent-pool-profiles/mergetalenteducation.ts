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

export function mergeTalentEducation(
  current: TalentPoolEducation,
  incoming: TalentPoolEducation
): TalentPoolEducation {
  return {
    university: incoming.university || current.university,
    major: incoming.major || current.major,
    gpa: formatGpa(incoming.gpa) || formatGpa(current.gpa),
    graduationYear: incoming.graduationYear || current.graduationYear,
    isSelfTaught: Boolean(incoming.isSelfTaught || current.isSelfTaught),
  };
}
