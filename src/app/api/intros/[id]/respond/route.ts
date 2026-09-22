import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import {
  toCandidateIntroStatus,
  type CandidateIntroStatus,
} from "@/lib/candidate-intro-requests";
import { getPublicProfileBaseUrl } from "@/lib/profile-url";
import {
  fetchCandidateIntroRequestById,
  isPendingCandidateIntroStatus,
  updateCandidateIntroRequestStatus,
} from "@/lib/respond-candidate-intro";
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
      a { display: inline-block; margin-top: 20px; background: #7c3aed; color: #fff; text-decoration: none; font-weight: 700; padding: 12px 18px; border-radius: 12px; }
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

function buildSuccessResponse(input: {
  status: CandidateIntroStatus;
  message: string;
  data?: unknown;
  wantsHtml: boolean;
  title: string;
  dashboardUrl: string;
}) {
  if (input.wantsHtml) {
    return new NextResponse(
      buildRespondHtml({
        title: input.title,
        message: input.message,
        dashboardUrl: input.dashboardUrl,
      }),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  return NextResponse.json(
    {
      success: true,
      status: input.status,
      message: input.message,
      data: input.data,
    },
    { status: 200 }
  );
}

async function handleIntroResponse(
  id: string,
  action: IntroRespondAction,
  options?: {
    token?: string | null;
    wantsHtml?: boolean;
  }
) {
  const wantsHtml = options?.wantsHtml ?? false;
  const dashboardUrl = `${getPublicProfileBaseUrl()}/dashboard?tab=intro_requests`;
  const token = options?.token?.trim() || null;

  let introRequest = null;
  let dataClient = createServiceRoleClient();
  let emailClient = dataClient;

  if (token) {
    if (!dataClient) {
      return NextResponse.json(
        { error: "Server misconfigured for email intro responses." },
        { status: 500 }
      );
    }

    introRequest = await fetchCandidateIntroRequestById(dataClient, id, {
      responseToken: token,
    });
  } else {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    dataClient = dataClient ?? authClient;
    emailClient = createServiceRoleClient() ?? authClient;

    introRequest = await fetchCandidateIntroRequestById(authClient, id, {
      candidateId: user.id,
    });
  }

  if (!dataClient) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (!introRequest) {
    return NextResponse.json(
      { error: "Intro request not found." },
      { status: 404 }
    );
  }

  const currentStatus = toCandidateIntroStatus(introRequest.status);

  if (!isPendingCandidateIntroStatus(introRequest.status)) {
    const message =
      currentStatus === "accepted"
        ? "This intro request was already accepted."
        : currentStatus === "dismissed"
          ? "This intro request was dismissed."
          : "This intro request was already declined.";

    return buildSuccessResponse({
      status: currentStatus,
      message,
      wantsHtml,
      title: "Intro request already handled",
      dashboardUrl,
    });
  }

  const updated = await updateCandidateIntroRequestStatus(
    dataClient,
    id,
    action
  );

  if (!updated) {
    return NextResponse.json(
      { error: "Could not update intro request." },
      { status: 500 }
    );
  }

  if (updated.status === "accepted") {
    await sendIntroEmail(updated.row, emailClient ?? dataClient);
  }

  const title = updated.status === "accepted" ? "Intro accepted" : "Intro declined";
  const message =
    updated.status === "accepted"
      ? "You're connected. Check your inbox for the mutual introduction email with employer contact details."
      : "The employer has been notified that you declined this introduction request.";

  return buildSuccessResponse({
    status: updated.status,
    message,
    data: updated.row,
    wantsHtml,
    title,
    dashboardUrl,
  });
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

  try {
    return await handleIntroResponse(id.trim(), action, {
      token,
      wantsHtml: true,
    });
  } catch (error) {
    console.error("Intro respond GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
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

    return await handleIntroResponse(id.trim(), action, {
      token: body.token,
      wantsHtml: false,
    });
  } catch (error) {
    console.error("Intro respond POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
