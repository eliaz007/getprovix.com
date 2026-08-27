import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

type JobStatus = "active" | "paused";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeJobStatus(value: unknown): JobStatus | null {
  if (value === "active") {
    return "active";
  }

  // Treat deactivation synonyms as paused (schema value for inactive listings).
  if (value === "paused" || value === "inactive") {
    return "paused";
  }

  return null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await context.params;

    if (!isUuid(jobId)) {
      return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
    }

    const body = (await request.json()) as { status?: unknown };
    const status = normalizeJobStatus(body.status);

    if (!status) {
      return NextResponse.json(
        { error: "status must be active, paused, or inactive." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: job, error: updateError } = await supabase
      .from("jobs")
      .update({ status })
      .eq("id", jobId)
      .eq("employer_id", user.id)
      .select("*")
      .maybeSingle();

    if (updateError) {
      console.error("[jobs] status update failed:", updateError);
      return NextResponse.json(
        { error: "Could not update job status." },
        { status: 500 }
      );
    }

    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    revalidatePath("/dashboard");
    revalidatePath("/opportunities");

    return NextResponse.json({ job });
  } catch (error) {
    console.error("[jobs] PATCH failed:", error);
    return NextResponse.json(
      { error: "Unexpected error updating job." },
      { status: 500 }
    );
  }
}
