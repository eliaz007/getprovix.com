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

export type TalentPoolProfileRow = {
  id?: string | null;
  role?: string | null;
  is_visible_in_pool?: boolean | string | number | null;
  visible_to_employers?: boolean | string | number | null;
  role_type?: string | null;
  [key: string]: unknown;
};
