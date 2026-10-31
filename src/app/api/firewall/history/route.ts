import { NextResponse } from "next/server";
import { listAutofixHistory } from "@/lib/firewall-open-prs";
import type { HealingAuditResponse } from "@/lib/healing-audit";
import { toGitHubOwnerRepo } from "@/lib/github-repo-ref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: HealingAuditResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const repo = new URL(request.url).searchParams.get("repo")?.trim() ?? "";
  if (!toGitHubOwnerRepo(repo)) {
    return json({ ok: false, entries: [], message: "repo must be owner/repo." }, 400);
  }
  const entries = await listAutofixHistory(repo);
  return json({ ok: true, entries });
}
