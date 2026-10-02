import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { consumeRateLimit, tooManyRequestsResponse } from "@/lib/ip-rate-limit";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
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

const verifyTokenBodySchema = z.object({
  owner: z.string().optional(),
  repo: z.string().optional(),
  expectedToken: z.string().optional(),
});

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

    const parsedBody = await parseJsonWithSchema(request, verifyTokenBodySchema);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const body = parsedBody.data;
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
