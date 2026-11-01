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
import { explainTalentPoolRowRejection } from "./explaintalentpoolrowrejection";

export function filterTalentPoolRows(
  rows: TalentPoolProfileRow[]
): TalentPoolProfileRow[] {
  console.info("[talent-pool] filterTalentPoolRows: raw rows from Supabase", {
    count: rows.length,
    rows: rows.map((row: (typeof rows)[number]) => ({
      id: row.id,
      role: row.role,
      is_visible_in_pool: row.is_visible_in_pool,
      visible_to_employers: row.visible_to_employers,
      github_verified: row.github_verified,
      production_score: row.production_score,
      audit_score: row.audit_score,
      open_to_fulltime: row.open_to_fulltime,
      open_to_contract: row.open_to_contract,
      full_name: row.full_name ?? row.name,
      job_title: row.job_title ?? row.headline,
      has_bio: typeof row.bio === "string" && row.bio.trim().length > 0,
      has_skills: Array.isArray(row.skills)
        ? row.skills.length
        : typeof row.skills === "string"
          ? row.skills.length
          : 0,
    })),
  });

  const kept: TalentPoolProfileRow[] = [];
  for (const row of rows) {
    const rejection = explainTalentPoolRowRejection(row);
    if (rejection) {
      console.warn("[talent-pool] filterTalentPoolRows: rejected row", {
        id: row.id,
        reason: rejection,
        isEmployerProfileRow: isEmployerProfileRow(row),
        isPublishedVerifiedCandidateProfile:
          isPublishedVerifiedCandidateProfile(row),
      });
      continue;
    }
    kept.push(row);
  }

  console.info("[talent-pool] filterTalentPoolRows: kept rows", {
    rawCount: rows.length,
    keptCount: kept.length,
    keptIds: kept.map((row: (typeof kept)[number]) => row.id),
  });

  return kept;
}
