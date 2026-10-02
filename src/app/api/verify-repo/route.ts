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
import { parseGitHubUrl } from "@/lib/validate-github-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERIFY_LIMIT = 8;
const VERIFY_WINDOW_MS = 10 * 60 * 1000;

const verifyRepoBodySchema = z.object({
  repo_url: z.string().optional(),
  token: z.string().optional(),
});

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

    const parsedBody = await parseJsonWithSchema(request, verifyRepoBodySchema);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const body = parsedBody.data;
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
