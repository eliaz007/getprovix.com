import { NextResponse } from "next/server";
import { z } from "zod";
import {
  parseIntroRequestId,
  requireAdminApiAccess,
} from "@/lib/admin-api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";

const adminActionBodySchema = z.object({
  id: z.string().optional(),
  requestId: z.string().optional(),
  introId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const access = await requireAdminApiAccess();
    if (access instanceof NextResponse) {
      return access;
    }

    const parsedBody = await parseJsonWithSchema(request, adminActionBodySchema);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const requestId = parseIntroRequestId(parsedBody.data);

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
