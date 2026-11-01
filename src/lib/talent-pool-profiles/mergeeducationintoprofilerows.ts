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
import { mergeProfileRowFields } from "./mergeprofilerowfields";

export function mergeEducationIntoProfileRows<T extends Record<string, unknown>>(
  rows: T[],
  educationRows: Record<string, unknown>[]
): T[] {
  if (educationRows.length === 0) {
    return rows;
  }

  const educationById = new Map<string, Record<string, unknown>>();
  for (const row of educationRows) {
    const mergedKeys = profileRowLookupIds(row);
    for (const id of mergedKeys) {
      const existing = educationById.get(id);
      educationById.set(
        id,
        existing ? mergeProfileRowFields(existing, row) : row
      );
    }
  }

  return rows.map((row: (typeof rows)[number]) => {
    let extra: Record<string, unknown> | undefined;
    for (const id of profileRowLookupIds(row)) {
      const match = educationById.get(id);
      extra = extra && match ? mergeProfileRowFields(extra, match) : extra ?? match;
    }
    return extra ? ({ ...row, ...extra } as T) : row;
  });
}
