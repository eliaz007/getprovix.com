import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSupabaseSchemaError,
  schemaErrorMentionsColumn,
} from "@/lib/supabase-schema-errors";

export type EmployerProfileFormData = {
  businessName: string;
  industry: string;
  companyBio: string;
  workEmail: string;
  phone: string;
  billingPlan: string;
};

function nullIfEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveEmployerBillingPlan(profile: {
  is_pro?: boolean | null;
  tier?: string | null;
}): string {
  if (profile.is_pro) {
    const tier = profile.tier?.trim();
    if (tier && tier.toLowerCase() !== "free") {
      return tier;
    }
    return "Pro";
  }

  return "Free Plan";
}

export function hydrateEmployerProfileFromRow(
  profile: {
    company_name?: string | null;
    industry?: string | null;
    bio?: string | null;
    contact_email?: string | null;
    email?: string | null;
    phone?: string | null;
    is_pro?: boolean | null;
    tier?: string | null;
  } | null,
  fallbackEmail?: string | null
): EmployerProfileFormData {
  return {
    businessName: profile?.company_name?.trim() ?? "",
    industry: profile?.industry?.trim() ?? "",
    companyBio: profile?.bio?.trim() ?? "",
    workEmail:
      profile?.contact_email?.trim() ??
      profile?.email?.trim() ??
      fallbackEmail?.trim() ??
      "",
    phone: profile?.phone?.trim() ?? "",
    billingPlan: resolveEmployerBillingPlan(profile ?? {}),
  };
}

export function buildEmployerProfileUpdatePayload(
  input: Pick<
    EmployerProfileFormData,
    "businessName" | "industry" | "companyBio" | "workEmail" | "phone"
  >
): Record<string, string | boolean | null> {
  const workEmail = nullIfEmpty(input.workEmail);

  return {
    company_name: nullIfEmpty(input.businessName),
    industry: nullIfEmpty(input.industry),
    bio: nullIfEmpty(input.companyBio),
    contact_email: workEmail,
    email: workEmail,
    phone: nullIfEmpty(input.phone),
  };
}

async function updateEmployerProfile(
  supabase: SupabaseClient,
  userId: string,
  payload: Record<string, string | boolean | null>
): Promise<{ error: { message?: string } | null }> {
  const { error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId);

  if (
    error &&
    isSupabaseSchemaError(error) &&
    schemaErrorMentionsColumn(error, "is_verified")
  ) {
    const retryPayload = { ...payload };
    delete retryPayload.is_verified;
    const retry = await supabase
      .from("profiles")
      .update(retryPayload)
      .eq("id", userId);
    return { error: retry.error };
  }

  return { error };
}

export async function persistEmployerProfile(
  supabase: SupabaseClient,
  userId: string,
  input: Pick<
    EmployerProfileFormData,
    "businessName" | "industry" | "companyBio" | "workEmail" | "phone"
  >
): Promise<{ error: { message?: string } | null; isVerified: boolean }> {
  const payload = buildEmployerProfileUpdatePayload(input);
  const nextEmail = (payload.contact_email ?? "").toString().trim().toLowerCase();

  const { data: current } = await supabase
    .from("profiles")
    .select("contact_email, email, is_verified")
    .eq("id", userId)
    .maybeSingle();

  const previousEmail = (
    current?.contact_email?.trim() ||
    current?.email?.trim() ||
    ""
  ).toLowerCase();
  const emailChanged = Boolean(nextEmail) && nextEmail !== previousEmail;
  const stillVerified = current?.is_verified === true && !emailChanged;

  if (emailChanged && current?.is_verified === true) {
    payload.is_verified = false;
  }

  const { error } = await updateEmployerProfile(supabase, userId, payload);

  return {
    error,
    isVerified: stillVerified,
  };
}
