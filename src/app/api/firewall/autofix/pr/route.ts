import { NextResponse } from "next/server";
import type { FirewallAutofixPullRequestResponse } from "@/lib/firewall-contract";
import { openAutofixPullRequest } from "@/lib/github-autofix-pr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: FirewallAutofixPullRequestResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  let body: { filePath?: unknown; repoUrl?: unknown };
  try {
    body = (await request.json()) as { filePath?: unknown; repoUrl?: unknown };
  } catch {
    return json({ ok: false, message: "Request body must be JSON." }, 400);
  }

  if (typeof body.filePath !== "string" || !body.filePath.trim()) {
    return json({ ok: false, message: "filePath is required." }, 400);
  }
  if (typeof body.repoUrl !== "string" || !body.repoUrl.trim()) {
    return json({ ok: false, message: "repoUrl is required to open a pull request." }, 400);
  }

  const opened = await openAutofixPullRequest(body.repoUrl.trim(), body.filePath.trim());
  return json(opened.body, opened.status);
}
