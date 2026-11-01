import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  resolveIntroCompanyEmail,
  resolveIntroCompensationRange,
  resolveIntroTargetRole,
} from "@/lib/candidate-intro-requests";
import { getPublicProfileBaseUrl } from "@/lib/profile-url";

export const CANDIDATE_CONTACT_COLUMNS =
  "full_name, contact_email, email, phone, linkedin_url, portfolio_url";
