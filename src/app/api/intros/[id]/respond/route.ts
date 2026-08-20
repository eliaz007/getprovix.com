import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import {
  CANDIDATE_INTRO_REQUEST_COLUMNS,
  normalizeCandidateIntroStatus,
} from "@/lib/candidate-intro-requests";
import { getPublicProfileBaseUrl } from "@/lib/profile-url";
import { sendIntroEmail } from "@/lib/send-intro-email";
import { createClient } from "@/utils/supabase/server";

type IntroRespondAction = "accept" | "decline";

function parseAction(value: string | null): IntroRespondAction | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "accept" || normalized === "decline") {
    return normalized;
  }
  return null;
}

function buildRespondHtml(input: {
  title: string;
  message: string;
  dashboardUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${input.title}</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #0A0A0A; color: #e2e8f0; }
      .wrap { max-width: 560px; margin: 48px auto; padding: 32px; background: #111111; border: 1px solid #334155; border-radius: 20px; }
      h1 { font-size: 24px; margin: 0 0 12px; color: #fff; }
      p { line-height: 1.6; color: #94a3b8; }
      a { display: inline-block; margin-top: 20px; background: #4f46e5; color: #fff; text-decoration: none; font-weight: 700; padding: 12px 18px; border-radius: 12px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>${input.title}</h1>
      <p>${input.message}</p>
      <a href="${input.dashboardUrl}">Open Intro Requests</a>
    </div>
  </body>
</html>`;
}

async function resolveIntroRequest(id: string, token?: string | null) {
  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    return { error: NextResponse.json({ error: "Server misconfigured" }, { status: 500 }) };
  }

  let query = serviceClient
    .from("intro_requests")
    .select(CANDIDATE_INTRO_REQUEST_COLUMNS)
    .eq("id", id);

  if (token?.trim()) {
    query = query.eq("response_token", token.trim());
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("Intro respond fetch error:", error);
    return {
      error: NextResponse.json(
        { error: "Could not load intro request." },
        { status: 500 }
      ),
    };
  }

  if (!data) {
    return {
      error: NextResponse.json(
        { error: "Intro request not found." },
        { status: 404 }
      ),
    };
  }

  return { introRequest: data, serviceClient };
}

async function authorizeCandidateOwnership(
  candidateId: string
): Promise<NextResponse | null> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.id !== candidateId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}

async function handleIntroResponse(
  id: string,
  action: IntroRespondAction,
  token?: string | null,
  wantsHtml = false
) {
  const resolved = await resolveIntroRequest(id, token);
  if ("error" in resolved && resolved.error) {
    return resolved.error;
  }

  const { introRequest, serviceClient } = resolved as {
    introRequest: Record<string, unknown>;
    serviceClient: NonNullable<ReturnType<typeof createServiceRoleClient>>;
  };

  const candidateId = String(introRequest.candidate_id ?? "");
  const currentStatus = normalizeCandidateIntroStatus(
    typeof introRequest.status === "string" ? introRequest.status : null
  );
  const dashboardUrl = `${getPublicProfileBaseUrl()}/dashboard?tab=intro_requests`;

  if (!token?.trim()) {
    const authError = await authorizeCandidateOwnership(candidateId);
    if (authError) {
      return authError;
    }
  }

  if (currentStatus !== "pending") {
    const message =
      currentStatus === "accepted"
        ? "This intro request was already accepted."
        : "This intro request was already declined.";

    if (wantsHtml) {
      return new NextResponse(
        buildRespondHtml({
          title: "Intro request already handled",
          message,
          dashboardUrl,
        }),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    return NextResponse.json(
      {
        success: true,
        status: currentStatus,
        message,
      },
      { status: 200 }
    );
  }

  const nextStatus = action === "accept" ? "accepted" : "declined";

  const { data: updatedRequest, error: updateError } = await serviceClient
    .from("intro_requests")
    .update({ status: nextStatus })
    .eq("id", id)
    .select(CANDIDATE_INTRO_REQUEST_COLUMNS)
    .single();

  if (updateError || !updatedRequest) {
    console.error("Intro respond update error:", updateError);
    return NextResponse.json(
      { error: "Could not update intro request." },
      { status: 500 }
    );
  }

  if (nextStatus === "accepted") {
    await sendIntroEmail(updatedRequest, serviceClient);
  }

  const title =
    nextStatus === "accepted"
      ? "Intro accepted"
      : "Intro declined";
  const message =
    nextStatus === "accepted"
      ? "You're connected. Check your inbox for the mutual introduction email with employer contact details."
      : "The employer has been notified that you declined this introduction request.";

  if (wantsHtml) {
    return new NextResponse(
      buildRespondHtml({ title, message, dashboardUrl }),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  return NextResponse.json(
    {
      success: true,
      status: nextStatus,
      message,
      data: updatedRequest,
    },
    { status: 200 }
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const action = parseAction(searchParams.get("action"));
  const token = searchParams.get("token");

  if (!id?.trim() || !action) {
    return NextResponse.json(
      { error: "Intro id and action are required." },
      { status: 400 }
    );
  }

  if (!token?.trim()) {
    return NextResponse.json(
      { error: "Response token is required for email links." },
      { status: 400 }
    );
  }

  return handleIntroResponse(id.trim(), action, token, true);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      action?: string;
      token?: string;
    };
    const action = parseAction(body.action ?? null);

    if (!id?.trim() || !action) {
      return NextResponse.json(
        { error: "Intro id and action are required." },
        { status: 400 }
      );
    }

    return handleIntroResponse(id.trim(), action, body.token, false);
  } catch (error) {
    console.error("Intro respond POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
