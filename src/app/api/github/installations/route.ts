import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { lookupGithubInstallation } from "@/lib/github-app-client";
import {
  EMPTY_GITHUB_APP_INSTALLATIONS,
  type GithubAppInstallationsResponse,
} from "@/lib/github-app-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function json(body: GithubAppInstallationsResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return json(EMPTY_GITHUB_APP_INSTALLATIONS);
  }

  const installationsQuery = await supabase
    .from("github_app_installations")
    .select("installation_id, account_login, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (installationsQuery.error) {
    console.error("[github-install] could not list installations", installationsQuery.error.message);
  }

  const installationIds = (installationsQuery.data ?? []).flatMap((row) => {
    const id = typeof row.installation_id === "number" ? row.installation_id : Number(row.installation_id);
    return Number.isSafeInteger(id) && id > 0 ? [id] : [];
  });

  const repositoriesQuery = await supabase
    .from("github_app_repositories")
    .select("full_name")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (repositoriesQuery.error) {
    console.error("[github-install] could not list repositories", repositoriesQuery.error.message);
  }

  let repositories = (repositoriesQuery.data ?? []).flatMap((row) =>
    typeof row.full_name === "string" && REPO_NAME.test(row.full_name) ? [row.full_name] : []
  );

  // When App credentials exist, refresh the newest installation against GitHub.
  const newest = installationIds[0];
  if (newest) {
    try {
      const live = await lookupGithubInstallation(newest);
      if (live.repositories.length > 0) {
        repositories = live.repositories;
        const savedAt = new Date().toISOString();
        const upsert = await supabase.from("github_app_repositories").upsert(
          live.repositories.map((fullName) => ({
            user_id: user.id,
            installation_id: newest,
            full_name: fullName,
            updated_at: savedAt,
          })),
          { onConflict: "user_id,full_name" }
        );
        if (upsert.error) {
          console.error("[github-install] could not refresh repositories", upsert.error.message);
        }
        if (live.accountLogin) {
          await supabase
            .from("github_app_installations")
            .update({ account_login: live.accountLogin, updated_at: savedAt })
            .eq("user_id", user.id)
            .eq("installation_id", newest);
        }
      }
    } catch (error) {
      console.error(
        "[github-install] GitHub installation lookup failed",
        error instanceof Error ? error.message : error
      );
    }
  }

  const installed = installationIds.length > 0 || repositories.length > 0;
  return json({
    authenticated: true,
    installed,
    installationIds,
    repositories,
    primaryRepo: repositories[0] ?? null,
  });
}
