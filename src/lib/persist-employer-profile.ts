import type { SupabaseClient } from "@supabase/supabase-js";

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
): Record<string, string | null> {
  return {
    company_name: nullIfEmpty(input.businessName),
    industry: nullIfEmpty(input.industry),
    bio: nullIfEmpty(input.companyBio),
    contact_email: nullIfEmpty(input.workEmail),
    phone: nullIfEmpty(input.phone),
  };
}

export async function persistEmployerProfile(
  supabase: SupabaseClient,
  userId: string,
  input: Pick<
    EmployerProfileFormData,
    "businessName" | "industry" | "companyBio" | "workEmail" | "phone"
  >
): Promise<{ error: { message?: string } | null }> {
  const payload = buildEmployerProfileUpdatePayload(input);

  const { error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId);

  return { error };
}
