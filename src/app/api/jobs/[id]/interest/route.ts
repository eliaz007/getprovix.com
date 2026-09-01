import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import { requireApiUser } from "@/lib/api-auth";
import { createEmployerNotification } from "@/lib/employer-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const access = await requireApiUser(request);
    if (access instanceof NextResponse) {
      return access;
    }

    const { id: jobId } = await context.params;
    if (!isUuid(jobId)) {
      return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
    }

    const { user, supabase } = access;
    const writer = createServiceRoleClient() ?? supabase;

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, title, employer_id, status")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) {
      console.error("[job interest] job lookup failed:", jobError.message);
      return NextResponse.json(
        { error: "Could not submit interest." },
        { status: 500 }
      );
    }

    if (!job || job.status !== "active") {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    if (job.employer_id === user.id) {
      return NextResponse.json(
        { error: "You cannot express interest in your own listing." },
        { status: 400 }
      );
    }

    const { error: insertError } = await writer.from("job_applications").insert({
      job_id: job.id,
      candidate_id: user.id,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({ ok: true, alreadyApplied: true });
      }

      console.error("[job interest] insert failed:", insertError.message);
      return NextResponse.json(
        { error: "Could not submit interest." },
        { status: 500 }
      );
    }

    if (job.employer_id) {
      const { data: existingNote } = await writer
        .from("notifications")
        .select("id")
        .eq("user_id", job.employer_id)
        .eq("job_id", job.id)
        .gte("created_at", new Date(Date.now() - 10_000).toISOString())
        .limit(1);

      if (!existingNote?.length) {
        await createEmployerNotification(writer, {
          userId: job.employer_id,
          jobId: job.id,
          message: `A candidate expressed interest in your role: ${
            job.title?.trim() || "Open Role"
          }`,
        });
      }
    }

    return NextResponse.json({ ok: true, alreadyApplied: false });
  } catch (error) {
    console.error("[job interest] unexpected error:", error);
    return NextResponse.json(
      { error: "Could not submit interest." },
      { status: 500 }
    );
  }
}
