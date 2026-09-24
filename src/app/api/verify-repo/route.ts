import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { consumeRateLimit, tooManyRequestsResponse } from "@/lib/ip-rate-limit";
import { canonicalGitHubRepoUrl } from "@/lib/provix-token";
import {
  findMatchingProvixFile,
  persistVerifiedRepo,
} from "@/lib/provix-token-server";
import { parseGitHubUrl } from "@/lib/validate-github-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERIFY_LIMIT = 8;
const VERIFY_WINDOW_MS = 10 * 60 * 1000;

type VerifyRepoBody = {
  repo_url?: unknown;
  token?: unknown;
};

function jsonServerError(error: unknown, fallback: string) {
  console.error("[verify-repo]", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function readStringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const access = await requireApiUser(request);
    if (access instanceof NextResponse) {
      return access;
    }

    const limited = consumeRateLimit(
      `verify-repo:${access.user.id}`,
      VERIFY_LIMIT,
      VERIFY_WINDOW_MS
    );
    if (!limited.ok) {
      return tooManyRequestsResponse(limited.retryAfterSec);
    }

    let body: VerifyRepoBody;
    try {
      body = (await request.json()) as VerifyRepoBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const repoUrlInput = readStringField(body.repo_url);
    const token = readStringField(body.token);

    if (!repoUrlInput) {
      return NextResponse.json(
        { error: "repo_url is required." },
        { status: 400 }
      );
    }

    if (!token) {
      return NextResponse.json({ error: "token is required." }, { status: 400 });
    }

    const parsed = parseGitHubUrl(repoUrlInput);
    if (!parsed?.repo) {
      return NextResponse.json(
        {
          error:
            "Enter a GitHub repository URL such as https://github.com/owner/repo.",
        },
        { status: 400 }
      );
    }

    const repoUrl = canonicalGitHubRepoUrl(parsed.owner, parsed.repo);
    const match = await findMatchingProvixFile(parsed.owner, parsed.repo, token);
    if (!match.ok) {
      return match.response;
    }

    const persisted = await persistVerifiedRepo({
      userId: access.user.id,
      repoUrl,
      token,
    });

    if (!persisted.ok) {
      return persisted.response;
    }

    return NextResponse.json({
      verified: true,
      already_verified: persisted.alreadyVerified,
      repo_url: repoUrl,
      branch: match.branch,
    });
  } catch (error) {
    return jsonServerError(error, "Could not verify the repository.");
  }
}
