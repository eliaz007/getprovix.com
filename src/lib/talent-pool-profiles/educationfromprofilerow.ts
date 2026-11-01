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
import { UNIVERSITY_KEYS } from "./university-keys";
import { MAJOR_KEYS } from "./major-keys";
import { GPA_KEYS } from "./gpa-keys";
import { GRADUATION_YEAR_KEYS } from "./graduation-year-keys";
import { valueFromRow } from "./valuefromrow";

export function educationFromProfileRow(
  row: Record<string, unknown> | null | undefined
): TalentPoolEducation {
  if (!row) {
    return {
      university: "",
      major: "",
      gpa: "",
      graduationYear: "",
      isSelfTaught: false,
    };
  }

  const fromEntries = parseEducationFromProfileRow(row);
  const primary = fromEntries[0];

  return {
    university: primary?.institution || valueFromRow(row, UNIVERSITY_KEYS),
    major: primary?.fieldOfStudy || valueFromRow(row, MAJOR_KEYS),
    gpa: formatGpa(valueFromRow(row, GPA_KEYS)),
    graduationYear:
      primary?.graduationYear || valueFromRow(row, GRADUATION_YEAR_KEYS),
    isSelfTaught: parseIsSelfTaught(row.is_self_taught ?? row.isSelfTaught),
  };
}
