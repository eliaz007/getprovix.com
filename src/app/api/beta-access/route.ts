import { NextResponse } from "next/server";
import { getCorporateWorkEmailValidationMessage } from "@/lib/corporate-email";
import { createClient } from "@/utils/supabase/server";

type BetaAccessBody = {
  company_name?: string;
  work_email?: string;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

function isSchemaError(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    (error.message?.includes("does not exist") ?? false) ||
    (error.message?.includes("Could not find the table") ?? false) ||
    (error.message?.includes("Could not find the") ?? false)
  );
}

async function saveBetaLead(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  companyName: string,
  workEmail: string
): Promise<{ saved: boolean; table?: string; warning?: string }> {
  try {
    const { error: betaLeadError } = await supabase.from("beta_leads").insert({
      user_id: userId,
      company_name: companyName,
      work_email: workEmail,
    });

    if (!betaLeadError) {
      return { saved: true, table: "beta_leads" };
    }

    if (isSchemaError(betaLeadError)) {
      console.warn(
        "[beta-access] beta_leads table unavailable, trying leads fallback:",
        betaLeadError
      );
    } else {
      console.error("[beta-access] beta_leads insert failed:", betaLeadError);
      return {
        saved: false,
        warning: betaLeadError.message ?? "Could not save beta lead.",
      };
    }
  } catch (error) {
    console.error("[beta-access] beta_leads insert threw:", error);
  }

  try {
    const { error: leadsError } = await supabase.from("leads").insert({
      user_id: userId,
      company_name: companyName,
      email: workEmail,
    });

    if (!leadsError) {
      return { saved: true, table: "leads" };
    }

    if (isSchemaError(leadsError)) {
      console.warn(
        "[beta-access] leads table unavailable; continuing without lead persistence:",
        leadsError
      );
      return {
        saved: false,
        warning: "Lead tables are not configured yet; beta access will still unlock.",
      };
    }

    console.error("[beta-access] leads insert failed:", leadsError);
    return {
      saved: false,
      warning: leadsError.message ?? "Could not save lead.",
    };
  } catch (error) {
    console.error("[beta-access] leads insert threw:", error);
    return {
      saved: false,
      warning: "Lead capture failed; beta access will still unlock.",
    };
  }
}

async function unlockEmployerProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  companyName: string,
  workEmail: string
): Promise<{ updated: boolean; warning?: string }> {
  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .update({
        is_pro: true,
        tier: "pro",
        company_name: companyName,
        contact_email: workEmail,
        email: workEmail,
      })
      .eq("id", userId)
      .select("id, is_pro, tier, company_name")
      .maybeSingle();

    if (!profileError && profile) {
      return { updated: true };
    }

    if (profileError && isSchemaError(profileError)) {
      console.warn(
        "[beta-access] Pro columns unavailable, falling back to company_name only:",
        profileError
      );

      const { error: fallbackError } = await supabase
        .from("profiles")
        .update({ company_name: companyName })
        .eq("id", userId);

      if (!fallbackError) {
        return {
          updated: false,
          warning:
            "Profile tier columns are missing; unlock will persist for this session.",
        };
      }

      console.error("[beta-access] company_name fallback failed:", fallbackError);
    } else if (profileError) {
      console.error("[beta-access] profile unlock failed:", profileError);
    }
  } catch (error) {
    console.error("[beta-access] profile unlock threw:", error);
  }

  return {
    updated: false,
    warning: "Could not update profile in Supabase; unlock will persist for this session.",
  };
}

export async function POST(request: Request) {
  let body: BetaAccessBody;

  try {
    body = (await request.json()) as BetaAccessBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const companyName = body.company_name?.trim() ?? "";
  const workEmail = body.work_email?.trim() ?? "";

  if (!companyName || !workEmail) {
    return NextResponse.json(
      { error: "Company name and work email are required." },
      { status: 400 }
    );
  }

  const emailError = getCorporateWorkEmailValidationMessage(workEmail);
  if (emailError) {
    return NextResponse.json({ error: emailError }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const warnings: string[] = [];

  const leadResult = await saveBetaLead(
    supabase,
    user.id,
    companyName,
    workEmail
  );
  if (leadResult.warning) {
    warnings.push(leadResult.warning);
  }

  const profileResult = await unlockEmployerProfile(
    supabase,
    user.id,
    companyName,
    workEmail
  );
  if (profileResult.warning) {
    warnings.push(profileResult.warning);
  }

  return NextResponse.json({
    success: true,
    unlocked: true,
    lead_saved: leadResult.saved,
    lead_table: leadResult.table ?? null,
    profile_updated: profileResult.updated,
    company_name: companyName,
    work_email: workEmail,
    warnings: warnings.length > 0 ? warnings : undefined,
  });
}
