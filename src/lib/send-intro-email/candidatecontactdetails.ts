import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  resolveIntroCompanyEmail,
  resolveIntroCompensationRange,
  resolveIntroTargetRole,
} from "@/lib/candidate-intro-requests";
import { getPublicProfileBaseUrl } from "@/lib/profile-url";

export type CandidateContactDetails = {
  fullName: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
};
