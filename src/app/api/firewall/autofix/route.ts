import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { FirewallAutofixResponse } from "@/lib/firewall-contract";
import { buildAutofix } from "@/lib/firewall-autofix";
import { isFirewallSourcePath, readGitHubSourceFile } from "@/lib/github-source-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CONTENT = 1_500_000;

function json(body: FirewallAutofixResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalizePath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!isFirewallSourcePath(normalized)) return null;
  return normalized;
}

function localAbsolutePath(filePath: string): string | null {
  if (!/\.tsx?$/.test(filePath)) return null;
  const root = path.resolve(process.cwd());
  const absolute = path.resolve(root, filePath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolute;
}

async function readLocalContent(filePath: string): Promise<string | null> {
  const absolute = localAbsolutePath(filePath);
  if (!absolute) return null;
  try {
    return await fs.readFile(absolute, "utf8");
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: { filePath?: unknown; content?: unknown; repoUrl?: unknown };
  try {
    body = (await request.json()) as { filePath?: unknown; content?: unknown; repoUrl?: unknown };
  } catch {
    return json({ ok: false, message: "Request body must be JSON." }, 400);
  }

  if (typeof body.filePath !== "string" || !body.filePath.trim()) {
    return json({ ok: false, message: "filePath is required." }, 400);
  }

  const filePath = normalizePath(body.filePath);
  if (!filePath) {
    return json(
      {
        ok: false,
        message: "filePath must be a TypeScript or JavaScript source file without path traversal.",
      },
      400
    );
  }

  let content = typeof body.content === "string" ? body.content : null;
  if (content === null) {
    content = await readLocalContent(filePath);
  }

  if (content === null && typeof body.repoUrl === "string" && body.repoUrl.trim()) {
    const remote = await readGitHubSourceFile(body.repoUrl.trim(), filePath);
    if (!remote.ok) {
      return json({ ok: false, filePath, message: remote.message }, remote.status);
    }
    content = remote.content;
  }

  if (content === null) {
    return json(
      {
        ok: false,
        filePath,
        message: "File not found. Re-run the audit or pass the repository URL with Auto-Fix.",
      },
      404
    );
  }

  if (content.length > MAX_CONTENT) {
    return json({ ok: false, filePath, message: "File is too large to refactor in one pass." }, 413);
  }

  return json(buildAutofix(filePath, content));
}
