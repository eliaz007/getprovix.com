import { NextResponse } from "next/server";
import {
  parseIntroRequestId,
  requireAdminApiAccess,
} from "@/lib/admin-api-auth";

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

    const { error: updateError } = await access.dataClient
      .from("intro_requests")
      .update({ status: "passed" })
      .eq("id", requestId);

    if (updateError) {
      console.error("Admin reject update error:", updateError);
      return NextResponse.json(
        { error: "Could not reject intro request" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin reject error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
