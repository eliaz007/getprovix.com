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
import type { TalentPoolProfileRow } from "./talentpoolprofilerow";
import { VISIBILITY_COLUMNS } from "./visibility-columns";
import { filterTalentPoolRows } from "./filtertalentpoolrows";
import { cacheBustTalentPoolQuery } from "./cachebusttalentpoolquery";

export async function fetchEmployerTalentPoolProfiles(
  supabase: SupabaseClient
): Promise<
  { data: TalentPoolProfileRow[]; error: null } | { data: []; error: unknown }
> {
  for (const visibilityColumn of VISIBILITY_COLUMNS) {
    let query = supabase
      .from("profiles")
      .select("*")
      .eq(visibilityColumn, true);

    query = cacheBustTalentPoolQuery(query);

    const { data, error } = await query;

    if (!error) {
      console.info("[talent-pool] fetchEmployerTalentPoolProfiles query ok", {
        visibilityColumn,
        rawCount: (data ?? []).length,
      });
      const filtered = filterTalentPoolRows(
        (data ?? []) as TalentPoolProfileRow[]
      );
      const ids = filtered.flatMap((row: (typeof filtered)[number]) => profileRowLookupIds(row));
      const educationRows = await selectProfileEducationRows(supabase, ids);

      return {
        data: mergeEducationIntoProfileRows(filtered, educationRows),
        error: null,
      };
    }

    if (!isSupabaseSchemaError(error)) {
      console.error("Failed to fetch talent pool profiles:", error);
      return { data: [], error };
    }

    if (schemaErrorMentionsColumn(error, visibilityColumn)) {
      continue;
    }

    console.warn(
      "Talent pool fetch skipped due to schema mismatch:",
      error.message
    );
    return { data: [], error: null };
  }

  return { data: [], error: null };
}
