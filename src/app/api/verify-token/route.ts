import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { consumeRateLimit, tooManyRequestsResponse } from "@/lib/ip-rate-limit";
import { canonicalGitHubRepoUrl } from "@/lib/provix-token";
import {
  findMatchingProvixFile,
  persistVerifiedRepo,
} from "@/lib/provix-token-server";
import { parseGitHubRepoPath } from "@/lib/validate-github-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERIFY_LIMIT = 8;
const VERIFY_WINDOW_MS = 10 * 60 * 1000;

type VerifyTokenBody = {
  owner?: unknown;
  repo?: unknown;
  expectedToken?: unknown;
};

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
      `verify-token:${access.user.id}`,
      VERIFY_LIMIT,
      VERIFY_WINDOW_MS
    );
    if (!limited.ok) {
      return tooManyRequestsResponse(limited.retryAfterSec);
    }

    let body: VerifyTokenBody;
    try {
      body = (await request.json()) as VerifyTokenBody;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body.", success: false, verified: false },
        { status: 400 }
      );
    }

    const owner = readStringField(body.owner);
    const repo = readStringField(body.repo);
    const expectedToken = readStringField(body.expectedToken);

    if (!owner || !repo) {
      return NextResponse.json(
        {
          error: "owner and repo are required.",
          success: false,
          verified: false,
        },
        { status: 400 }
      );
    }

    if (!expectedToken) {
      return NextResponse.json(
        {
          error: "expectedToken is required.",
          success: false,
          verified: false,
        },
        { status: 400 }
      );
    }

    const parsed = parseGitHubRepoPath(`${owner}/${repo}`);
    if (!parsed) {
      return NextResponse.json(
        {
          error: "Enter a valid GitHub owner and repository name.",
          success: false,
          verified: false,
        },
        { status: 400 }
      );
    }

    const match = await findMatchingProvixFile(
      parsed.owner,
      parsed.repo,
      expectedToken
    );
    if (!match.ok) {
      return match.response;
    }

    const repoUrl = canonicalGitHubRepoUrl(parsed.owner, parsed.repo);
    const persisted = await persistVerifiedRepo({
      userId: access.user.id,
      repoUrl,
      token: expectedToken,
    });

    if (!persisted.ok) {
      return persisted.response;
    }

    return NextResponse.json({
      success: true,
      verified: true,
      already_verified: persisted.alreadyVerified,
      repo_url: repoUrl,
      branch: match.branch,
    });
  } catch (error) {
    console.error("[verify-token]", error);
    return NextResponse.json(
      {
        error: "Could not verify the repository token.",
        success: false,
        verified: false,
      },
      { status: 500 }
    );
  }
}
