import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import { createClient } from "@/utils/supabase/server";
import { fetchPublicJobFeed } from "@/lib/jobs";

export async function GET() {
  try {
    const serviceClient = createServiceRoleClient();
    const supabase = serviceClient ?? (await createClient());
    const { data, error } = await fetchPublicJobFeed(supabase);

    if (error) {
      console.error("[jobs/feed] failed to load public jobs:", error);
      return NextResponse.json(
        { error: "Could not load job feed." },
        { status: 500 }
      );
    }

    return NextResponse.json({ jobs: data });
  } catch (error) {
    console.error("[jobs/feed] unexpected error:", error);
    return NextResponse.json(
      { error: "Could not load job feed." },
      { status: 500 }
    );
  }
}
