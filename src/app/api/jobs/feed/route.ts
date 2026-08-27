import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import { createClient } from "@/utils/supabase/server";
import type { JobRow } from "@/lib/jobs";

const PUBLIC_JOB_COLUMNS =
  "id, title, company, location, salary_range, tags, employer_id, status, created_at";

export async function GET() {
  try {
    const serviceClient = createServiceRoleClient();
    const supabase = serviceClient ?? (await createClient());

    const { data, error } = await supabase
      .from("jobs")
      .select(PUBLIC_JOB_COLUMNS)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[jobs/feed] failed to load public jobs:", error);
      return NextResponse.json(
        { error: "Could not load job feed." },
        { status: 500 }
      );
    }

    return NextResponse.json({ jobs: (data ?? []) as JobRow[] });
  } catch (error) {
    console.error("[jobs/feed] unexpected error:", error);
    return NextResponse.json(
      { error: "Could not load job feed." },
      { status: 500 }
    );
  }
}
