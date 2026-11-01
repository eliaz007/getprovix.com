import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  resolveIntroCompanyEmail,
  resolveIntroCompensationRange,
  resolveIntroTargetRole,
} from "@/lib/candidate-intro-requests";
import { getPublicProfileBaseUrl } from "@/lib/profile-url";

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}
