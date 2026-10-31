import { NextResponse } from "next/server";
import { listHealingAuditRows } from "@/lib/firewall-open-prs";
import { buildHealingAuditSummary, type HealingSummaryResponse } from "@/lib/healing-audit-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await listHealingAuditRows();
  const summary = buildHealingAuditSummary(rows);
  const body: HealingSummaryResponse = { ok: true, summary };
  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
