import { NextResponse } from "next/server";
import { isSecurityCategory, type FirewallAutofixPullRequestResponse, type FirewallResolvedFilesResponse } from "@/lib/firewall-contract";
import { listOpenAutofixPulls } from "@/lib/firewall-open-prs";
import { openAutofixPullRequest, openSecurityFixPullRequest } from "@/lib/github-autofix-pr";
import { toGitHubOwnerRepo } from "@/lib/github-repo-ref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: FirewallAutofixPullRequestResponse | FirewallResolvedFilesResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const repo = new URL(request.url).searchParams.get("repo")?.trim() ?? "";
  if (!toGitHubOwnerRepo(repo)) {
    return json({ ok: false, filePaths: [], message: "repo must be owner/repo." }, 400);
  }
  const recorded = await listOpenAutofixPulls(repo);
  return json({
    ok: true,
    filePaths: recorded.map((pull) => pull.filePath),
    pulls: recorded.map(({ filePath, number, url }) => ({ filePath, number, url })),
  });
}

export async function POST(request: Request) {
  let body: {
    kind?: unknown;
    filePath?: unknown;
    repoUrl?: unknown;
    line?: unknown;
    category?: unknown;
    snippet?: unknown;
  };
  try {
    body = (await request.json()) as {
      kind?: unknown;
      filePath?: unknown;
      repoUrl?: unknown;
      line?: unknown;
      category?: unknown;
      snippet?: unknown;
    };
  } catch {
    return json({ ok: false, message: "Request body must be JSON." }, 400);
  }

  if (typeof body.filePath !== "string" || !body.filePath.trim()) {
    return json({ ok: false, message: "filePath is required." }, 400);
  }
  if (typeof body.repoUrl !== "string" || !body.repoUrl.trim()) {
    return json({ ok: false, message: "repoUrl is required to open a pull request." }, 400);
  }

  if (body.kind === "security") {
    const category = typeof body.category === "string" ? body.category : undefined;
    if (typeof body.line !== "number" || !Number.isInteger(body.line) || body.line < 1) {
      return json({ ok: false, message: "line must be a positive integer." }, 400);
    }
    if (!isSecurityCategory(category)) {
      return json({ ok: false, message: "category must be a security finding." }, 400);
    }
    const snippet = typeof body.snippet === "string" ? body.snippet : undefined;
    const opened = await openSecurityFixPullRequest(
      body.repoUrl.trim(),
      body.filePath.trim(),
      body.line,
      category,
      { snippet }
    );
    return json(opened.body, opened.status);
  }

  const opened = await openAutofixPullRequest(body.repoUrl.trim(), body.filePath.trim());
  return json(opened.body, opened.status);
}
