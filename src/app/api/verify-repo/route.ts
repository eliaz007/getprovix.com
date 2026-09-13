import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import { requireApiUser } from "@/lib/api-auth";
import { consumeRateLimit, tooManyRequestsResponse } from "@/lib/ip-rate-limit";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";
import { parseGitHubUrl } from "@/lib/validate-github-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERIFY_LIMIT = 8;
const VERIFY_WINDOW_MS = 10 * 60 * 1000;
const GITHUB_FETCH_TIMEOUT_MS = 15_000;
const PROVIX_FILENAME = "provix.txt";
const BRANCHES_TO_TRY = ["main", "master"] as const;

type VerifyRepoBody = {
  repo_url?: unknown;
  token?: unknown;
};

type GithubFileResult =
  | { kind: "found"; branch: string; content: string }
  | { kind: "missing"; branch: string }
  | { kind: "error"; branch: string; status: number; message: string };

function jsonServerError(error: unknown, fallback: string) {
  console.error("[verify-repo]", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function missingTableResponse() {
  return NextResponse.json(
    {
      error:
        "Repo verification is not enabled yet. Apply Supabase migration 0072_create_repo_verifications.sql.",
    },
    { status: 500 }
  );
}

function readStringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProofToken(value: string): string {
  return value.replace(/^\uFEFF/, "").trim();
}

function canonicalGitHubRepoUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}`;
}

function githubRawProvixUrl(owner: string, repo: string, branch: string): string {
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${PROVIX_FILENAME}`;
}

function githubFetchHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "text/plain",
    "User-Agent": "Provix-RepoVerification/1.0",
  };

  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function fetchProvixOnBranch(
  owner: string,
  repo: string,
  branch: string
): Promise<GithubFileResult> {
  const url = githubRawProvixUrl(owner, repo, branch);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      headers: githubFetchHeaders(),
      signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
    });

    if (response.status === 404) {
      return { kind: "missing", branch };
    }

    if (response.status === 429) {
      return {
        kind: "error",
        branch,
        status: 429,
        message: "GitHub rate-limited the verification request. Try again shortly.",
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        kind: "error",
        branch,
        status: response.status,
        message:
          "GitHub denied access to this repository. Make sure the repo is public and provix.txt is at the root.",
      };
    }

    if (!response.ok) {
      return {
        kind: "error",
        branch,
        status: response.status,
        message: `GitHub returned ${response.status} while reading ${PROVIX_FILENAME} on ${branch}.`,
      };
    }

    const content = await response.text();
    return { kind: "found", branch, content };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      return {
        kind: "error",
        branch,
        status: 504,
        message: `Timed out reading ${PROVIX_FILENAME} from the ${branch} branch.`,
      };
    }

    console.error(`[verify-repo] fetch failed for ${url}:`, error);
    return {
      kind: "error",
      branch,
      status: 502,
      message: `Could not reach GitHub to read ${PROVIX_FILENAME} on ${branch}.`,
    };
  }
}

async function findMatchingProvixFile(
  owner: string,
  repo: string,
  expectedToken: string
): Promise<
  | { ok: true; branch: string }
  | { ok: false; response: NextResponse }
> {
  const expected = normalizeProofToken(expectedToken);
  let sawFile = false;
  let lastError: Extract<GithubFileResult, { kind: "error" }> | null = null;
  const missingBranches: string[] = [];

  for (const branch of BRANCHES_TO_TRY) {
    const result = await fetchProvixOnBranch(owner, repo, branch);

    if (result.kind === "missing") {
      missingBranches.push(branch);
      continue;
    }

    if (result.kind === "error") {
      lastError = result;
      continue;
    }

    sawFile = true;
    if (normalizeProofToken(result.content) === expected) {
      return { ok: true, branch: result.branch };
    }
  }

  if (sawFile) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `${PROVIX_FILENAME} was found, but its contents did not match the verification token.`,
          verified: false,
        },
        { status: 400 }
      ),
    };
  }

  if (lastError) {
    const status = lastError.status === 429 ? 429 : lastError.status >= 500 ? 502 : 400;
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: lastError.message,
          verified: false,
          missing_branches: missingBranches,
        },
        { status }
      ),
    };
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: `${PROVIX_FILENAME} was not found on the main or master branch. Add the file at the repository root and try again.`,
        verified: false,
        missing_branches: missingBranches.length > 0 ? missingBranches : [...BRANCHES_TO_TRY],
      },
      { status: 404 }
    ),
  };
}

type PersistResult =
  | { ok: true; alreadyVerified: boolean }
  | { ok: false; response: NextResponse };

async function persistVerifiedRepo(input: {
  userId: string;
  repoUrl: string;
  token: string;
}): Promise<PersistResult> {
  const admin = createServiceRoleClient();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Verification is temporarily unavailable." },
        { status: 503 }
      ),
    };
  }

  const { data: existing, error: lookupError } = await admin
    .from("repo_verifications")
    .select("id, is_verified")
    .eq("user_id", input.userId)
    .eq("repo_url", input.repoUrl)
    .maybeSingle();

  if (lookupError) {
    if (isSupabaseSchemaError(lookupError)) {
      return { ok: false, response: missingTableResponse() };
    }

    console.error("[verify-repo] lookup failed:", lookupError.message);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Could not update repository verification." },
        { status: 500 }
      ),
    };
  }

  if (existing?.id) {
    const { error: updateError } = await admin
      .from("repo_verifications")
      .update({
        token: input.token,
        is_verified: true,
      })
      .eq("id", existing.id)
      .eq("user_id", input.userId);

    if (updateError) {
      if (isSupabaseSchemaError(updateError)) {
        return { ok: false, response: missingTableResponse() };
      }

      console.error("[verify-repo] update failed:", updateError.message);
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Could not update repository verification." },
          { status: 500 }
        ),
      };
    }

    return { ok: true, alreadyVerified: existing.is_verified === true };
  }

  const { error: insertError } = await admin.from("repo_verifications").insert({
    user_id: input.userId,
    repo_url: input.repoUrl,
    token: input.token,
    is_verified: true,
  });

  if (!insertError) {
    return { ok: true, alreadyVerified: false };
  }

  if (isSupabaseSchemaError(insertError)) {
    return { ok: false, response: missingTableResponse() };
  }

  if (insertError.code === "23505") {
    const { error: conflictUpdateError } = await admin
      .from("repo_verifications")
      .update({
        token: input.token,
        is_verified: true,
      })
      .eq("user_id", input.userId)
      .eq("repo_url", input.repoUrl);

    if (conflictUpdateError) {
      console.error(
        "[verify-repo] conflict update failed:",
        conflictUpdateError.message
      );
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Could not update repository verification." },
          { status: 500 }
        ),
      };
    }

    return { ok: true, alreadyVerified: false };
  }

  console.error("[verify-repo] insert failed:", insertError.message);
  return {
    ok: false,
    response: NextResponse.json(
      { error: "Could not save repository verification." },
      { status: 500 }
    ),
  };
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
