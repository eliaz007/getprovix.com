import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import {
  fetchCandidateIntroRequestById,
  updateCandidateIntroDismissed,
} from "@/lib/respond-candidate-intro";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const introId = id?.trim() ?? "";
    const body = (await request.json()) as { dismissed?: unknown };
    const dismissed = body.dismissed;

    if (!introId || typeof dismissed !== "boolean") {
      return NextResponse.json(
        { error: "Intro id and dismissed are required." },
        { status: 400 }
      );
    }

    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const introRequest = await fetchCandidateIntroRequestById(authClient, introId, {
      candidateId: user.id,
    });

    if (!introRequest) {
      return NextResponse.json(
        { error: "Intro request not found." },
        { status: 404 }
      );
    }

    const dataClient = createServiceRoleClient() ?? authClient;
    const updated = await updateCandidateIntroDismissed(
      dataClient,
      introRequest,
      dismissed
    );

    if (!updated) {
      return NextResponse.json(
        { error: "Could not update intro request." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      dismissed,
      status: updated.status,
      candidate_dismissed_at: updated.candidate_dismissed_at ?? null,
      message: dismissed
        ? "Intro request moved to dismissed."
        : "Intro request restored to your inbox.",
      data: updated,
    });
  } catch (error) {
    console.error("Intro dismiss POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
