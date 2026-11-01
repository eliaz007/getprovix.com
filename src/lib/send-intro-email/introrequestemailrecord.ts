import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  resolveIntroCompanyEmail,
  resolveIntroCompensationRange,
  resolveIntroTargetRole,
} from "@/lib/candidate-intro-requests";
import { getPublicProfileBaseUrl } from "@/lib/profile-url";

export type IntroRequestEmailRecord = {
  id: string;
  candidate_id: string;
  candidate_name: string | null;
  company_name: string | null;
  work_email?: string | null;
  company_email?: string | null;
  role_title?: string | null;
  target_role?: string | null;
  compensation_band?: string | null;
  compensation_range?: string | null;
  status: string;
};
