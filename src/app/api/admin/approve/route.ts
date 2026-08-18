import { NextResponse } from "next/server";
import {
  parseIntroRequestId,
  requireAdminApiAccess,
} from "@/lib/admin-api-auth";
import { sendIntroEmail } from "@/lib/send-intro-email";

type AdminActionBody = {
  id?: string;
  requestId?: string;
  introId?: string;
};

export async function POST(request: Request) {
  try {
    const access = await requireAdminApiAccess();
    if (access instanceof NextResponse) {
      return access;
    }

    const body = (await request.json()) as AdminActionBody;
    const requestId = parseIntroRequestId(body);

    if (!requestId) {
      return NextResponse.json(
        { error: "Intro request id is required" },
        { status: 400 }
      );
    }

    const { data: updatedRequest, error: updateError } = await access.dataClient
      .from("intro_requests")
      .update({ status: "approved_intro_sent" })
      .eq("id", requestId)
      .select()
      .single();

    if (updateError) {
      console.error("Admin approve update error:", updateError);
      return NextResponse.json(
        { error: "Could not update intro request status" },
        { status: 500 }
      );
    }

    if (!updatedRequest) {
      return NextResponse.json(
        { error: "Intro request not found" },
        { status: 404 }
      );
    }

    await sendIntroEmail(updatedRequest, access.dataClient);

    return NextResponse.json(
      { success: true, data: updatedRequest },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin approve error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
