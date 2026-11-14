import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { isSecurityCategory, type FirewallAutofixPullRequestResponse, type FirewallResolvedFilesResponse } from "@/lib/firewall-contract";
import { authorizeFirewallRepoAccess, readProvidedGithubToken } from "@/lib/firewall-repo-access";
import { listOpenAutofixPulls } from "@/lib/firewall-open-prs";
import { resolveGithubRepoAccessToken } from "@/lib/github-app-client";
import { openAutofixPullRequest, openSecurityFixPullRequest } from "@/lib/github-autofix-pr";
import { toGitHubOwnerRepo } from "@/lib/github-repo-ref";
import type { PvimFindingLike } from "@/lib/pvim/pvim-remediation-adapter";
import { openPvimRemediationPullRequest } from "@/lib/pvim/pvim-remediation-pr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: FirewallAutofixPullRequestResponse | FirewallResolvedFilesResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function asPvimFinding(value: unknown): PvimFindingLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.finding_id !== "string" || !record.finding_id.trim()) return null;
  if (record.source !== "m1" && record.source !== "m2") return null;
  if (typeof record.label !== "string" || !record.label.trim()) return null;
  if (typeof record.confidence !== "string" || !record.confidence.trim()) return null;
  if (typeof record.rule_id !== "string") return null;

  const evidence = Array.isArray(record.evidence)
    ? record.evidence
        .filter((step): step is Record<string, unknown> => !!step && typeof step === "object")
        .map((step) => ({
          path: typeof step.path === "string" ? step.path : "",
          line: typeof step.line === "number" ? step.line : null,
          kind: typeof step.kind === "string" ? step.kind : "",
          detail: typeof step.detail === "string" ? step.detail : undefined,
        }))
        .filter((step) => step.path || step.kind)
    : undefined;

  return {
    finding_id: record.finding_id.trim(),
    source: record.source,
    family: typeof record.family === "string" ? record.family : record.family === null ? null : undefined,
    label: record.label.trim(),
    rule_id: record.rule_id,
    confidence: record.confidence.trim(),
    path: typeof record.path === "string" ? record.path : record.path === null ? null : undefined,
    start_line: typeof record.start_line === "number" ? record.start_line : record.start_line === null ? null : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
    evidence,
  };
}

export async function GET(request: Request) {
  const repo = new URL(request.url).searchParams.get("repo")?.trim() ?? "";
  const ownerRepo = toGitHubOwnerRepo(repo);
  if (!ownerRepo) {
    return json({ ok: false, filePaths: [], message: "repo must be owner/repo." }, 400);
  }
  const [owner, name] = ownerRepo.split("/");
  const access =
    owner && name
      ? await resolveGithubRepoAccessToken(owner, name)
      : { ok: false as const, status: 400, message: "repo must be owner/repo." };
  const recorded = await listOpenAutofixPulls(repo);
  return json({
    ok: true,
    filePaths: recorded.map((pull) => pull.filePath),
    pulls: recorded.map(({ filePath, number, url }) => ({ filePath, number, url })),
    canOpenPullRequest: access.ok,
    accessMessage: access.ok ? undefined : access.message,
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
    commitSha?: unknown;
    pvimFinding?: unknown;
    githubToken?: unknown;
  };
  try {
    body = (await request.json()) as {
      kind?: unknown;
      filePath?: unknown;
      repoUrl?: unknown;
      line?: unknown;
      category?: unknown;
      snippet?: unknown;
      commitSha?: unknown;
      pvimFinding?: unknown;
      githubToken?: unknown;
    };
  } catch {
    return json({ ok: false, message: "Request body must be JSON." }, 400);
  }

  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return json({ ok: false, message: "Sign in to open a fix pull request." }, 401);
  }

  const pvimFindingRaw = body.pvimFinding;
  const hasPvimFinding = pvimFindingRaw != null;
  if (hasPvimFinding && body.kind !== "security") {
    return json(
      { ok: false, message: "pvimFinding is only accepted on kind \"security\" requests." },
      400
    );
  }

  const pvimFinding = hasPvimFinding ? asPvimFinding(pvimFindingRaw) : null;
  if (hasPvimFinding && !pvimFinding) {
    return json({ ok: false, message: "pvimFinding must be a PVIM shadow finding object." }, 400);
  }

  const filePathFromBody = typeof body.filePath === "string" ? body.filePath.trim() : "";
  const filePath =
    filePathFromBody ||
    (pvimFinding && typeof pvimFinding.path === "string" ? pvimFinding.path.trim() : "");
  if (!filePath) {
    return json({ ok: false, message: "filePath is required." }, 400);
  }
  if (typeof body.repoUrl !== "string" || !body.repoUrl.trim()) {
    return json({ ok: false, message: "repoUrl is required to open a pull request." }, 400);
  }

  const ownerRepo = toGitHubOwnerRepo(body.repoUrl);
  const [owner, name] = ownerRepo?.split("/") ?? [];
  if (!owner || !name) {
    return json({ ok: false, message: "repoUrl must be a public GitHub URL or owner/repo." }, 400);
  }
  const granted = await authorizeFirewallRepoAccess({
    supabase: session.supabase,
    userId: session.user.id,
    owner,
    repo: name,
    githubToken: readProvidedGithubToken(body.githubToken),
    purpose: "write",
  });
  if (!granted.ok) {
    return json({ ok: false, message: granted.message }, granted.status);
  }

  if (body.kind === "security") {
    const commitSha = typeof body.commitSha === "string" ? body.commitSha : undefined;
    const snippet = typeof body.snippet === "string" ? body.snippet : undefined;

    if (pvimFinding) {
      if (!commitSha || !commitSha.trim()) {
        return json(
          { ok: false, message: "commitSha is required when pvimFinding is supplied." },
          400
        );
      }
      const opened = await openPvimRemediationPullRequest(body.repoUrl.trim(), pvimFinding, {
        token: granted.token,
        commitSha,
        snippet,
      });
      return json(opened.body, opened.status);
    }

    const category = typeof body.category === "string" ? body.category : undefined;
    if (typeof body.line !== "number" || !Number.isInteger(body.line) || body.line < 1) {
      return json({ ok: false, message: "line must be a positive integer." }, 400);
    }
    if (!isSecurityCategory(category)) {
      return json({ ok: false, message: "category must be a security finding." }, 400);
    }
    const opened = await openSecurityFixPullRequest(
      body.repoUrl.trim(),
      filePath,
      body.line,
      category,
      { snippet, token: granted.token, commitSha }
    );
    return json(opened.body, opened.status);
  }

  const opened = await openAutofixPullRequest(body.repoUrl.trim(), filePath, granted.token);
  return json(opened.body, opened.status);
}
