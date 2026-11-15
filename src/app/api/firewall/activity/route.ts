import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { listHealingAuditRows, type HealingAuditRow } from "@/lib/firewall-open-prs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActivityResponse = {
  ok: boolean;
  entries: HealingAuditRow[];
  message?: string;
};

function json(body: ActivityResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return json({ ok: false, entries: [], message: "Sign in to view activity." }, 401);
  }

  try {
    const entries = await listHealingAuditRows();
    return json({ ok: true, entries });
  } catch (error) {
    console.error("[activity] list failed", error);
    return json(
      {
        ok: false,
        entries: [],
        message: error instanceof Error ? error.message : "Could not load activity.",
      },
      500
    );
  }
}
