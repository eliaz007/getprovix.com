import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

type BetaAccessBody = {
  company_name?: string;
  work_email?: string;
};

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

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(workEmail)) {
    return NextResponse.json(
      { error: "Enter a valid work email address." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { error: leadError } = await supabase.from("beta_leads").insert({
    user_id: user.id,
    company_name: companyName,
    work_email: workEmail,
  });

  if (leadError) {
    console.error("beta_leads insert failed:", leadError);
    return NextResponse.json(
      {
        error:
          "Could not save beta signup. Ensure the beta_leads migration has been applied.",
      },
      { status: 500 }
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .update({
      is_pro: true,
      tier: "pro",
      company_name: companyName,
    })
    .eq("id", user.id)
    .select("id, is_pro, tier, company_name")
    .maybeSingle();

  if (profileError || !profile) {
    console.error("Profile beta unlock failed:", profileError);
    return NextResponse.json(
      { error: "Lead saved but could not unlock beta access on your profile." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    profile,
  });
}
