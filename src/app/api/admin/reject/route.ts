import { NextResponse } from "next/server";
import { isAllowedAdminUser } from "@/lib/admin-access";
import { createClient } from "@/utils/supabase/server";

type AdminActionBody = {
  requestId?: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!isAllowedAdminUser(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as AdminActionBody;
    const requestId = body.requestId?.trim();

    if (!requestId) {
      return NextResponse.json(
        { error: "requestId is required" },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("intro_requests")
      .update({ status: "rejected" })
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
