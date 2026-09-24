import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";
import {
  PROVIX_BRANCHES,
  PROVIX_FILENAME,
  normalizeProofToken,
} from "@/lib/provix-token";

export type GithubFileResult =
  | { kind: "found"; branch: string; content: string }
  | { kind: "missing"; branch: string }
  | { kind: "error"; branch: string; status: number; message: string };

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

export async function fetchProvixOnBranch(
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
      signal: AbortSignal.timeout(15_000),
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

    console.error(`[provix-token] fetch failed for ${url}:`, error);
    return {
      kind: "error",
      branch,
      status: 502,
      message: `Could not reach GitHub to read ${PROVIX_FILENAME} on ${branch}.`,
    };
  }
}

export async function findMatchingProvixFile(
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

  for (const branch of PROVIX_BRANCHES) {
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
          error: `${PROVIX_FILENAME} was found, but the token did not match.`,
          verified: false,
          success: false,
        },
        { status: 400 }
      ),
    };
  }

  if (lastError) {
    const status =
      lastError.status === 429 ? 429 : lastError.status >= 500 ? 502 : 400;
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: lastError.message,
          verified: false,
          success: false,
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
        error: `${PROVIX_FILENAME} was not detected on main or master. Add the file at the repository root with your verification token and try again.`,
        verified: false,
        success: false,
        missing_branches:
          missingBranches.length > 0 ? missingBranches : [...PROVIX_BRANCHES],
      },
      { status: 404 }
    ),
  };
}

function missingTableResponse() {
  return NextResponse.json(
    {
      error:
        "Repo verification is not enabled yet. Apply Supabase migration 0072_create_repo_verifications.sql.",
      verified: false,
      success: false,
    },
    { status: 500 }
  );
}

export async function persistVerifiedRepo(input: {
  userId: string;
  repoUrl: string;
  token: string;
}): Promise<
  | { ok: true; alreadyVerified: boolean }
  | { ok: false; response: NextResponse }
> {
  const admin = createServiceRoleClient();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Verification is temporarily unavailable.", verified: false, success: false },
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
    console.error("[provix-token] lookup failed:", lookupError.message);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Could not update repository verification.", verified: false, success: false },
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
      console.error("[provix-token] update failed:", updateError.message);
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Could not update repository verification.", verified: false, success: false },
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
      console.error("[provix-token] conflict update failed:", conflictUpdateError.message);
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Could not update repository verification.", verified: false, success: false },
          { status: 500 }
        ),
      };
    }

    return { ok: true, alreadyVerified: false };
  }

  console.error("[provix-token] insert failed:", insertError.message);
  return {
    ok: false,
    response: NextResponse.json(
      { error: "Could not save repository verification.", verified: false, success: false },
      { status: 500 }
    ),
  };
}
