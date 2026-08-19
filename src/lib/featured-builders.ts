import {
  getPublicCandidateDisplayName,
  getPublicCandidateInitials,
} from "@/lib/candidate-anonymization";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FeaturedBuilder = {
  id: string;
  profileSlug: string;
  fullName: string;
  initials: string;
  roleTitle: string;
  bioSnippet: string;
  skills: string[];
  proofScore: number | null;
  avatarUrl: string | null;
  hasGitHubRepos: boolean;
};

type FeaturedBuilderRow = {
  id?: string | null;
  profile_slug?: string | null;
  full_name?: string | null;
  job_title?: string | null;
  bio?: string | null;
  skills?: string[] | null;
  avatar_url?: string | null;
  codename_alias?: string | null;
  integrity_score?: number | null;
  has_github_repos?: boolean | null;
  portfolio_url?: string | null;
  youtube_url?: string | null;
  updated_at?: string | null;
};

function truncateBio(value: string, maxLength = 140): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function hasProofOfWork(row: FeaturedBuilderRow): boolean {
  return Boolean(row.portfolio_url?.trim() || row.youtube_url?.trim());
}

export function isPublishedVerifiedFeaturedBuilderRow(
  row: FeaturedBuilderRow
): boolean {
  if (!row.id?.trim()) {
    return false;
  }

  if (!row.profile_slug?.trim()) {
    return false;
  }

  if (!row.job_title?.trim()) {
    return false;
  }

  if (!row.bio?.trim()) {
    return false;
  }

  return hasProofOfWork(row);
}

export function mapFeaturedBuilderRow(
  row: FeaturedBuilderRow
): FeaturedBuilder | null {
  if (!isPublishedVerifiedFeaturedBuilderRow(row)) {
    return null;
  }

  const id = row.id!.trim();
  const identity = {
    codenameAlias: row.codename_alias,
    fullName: row.full_name,
    candidateId: id,
  };

  const fullName = getPublicCandidateDisplayName(identity);
  const roleTitle = row.job_title!.trim();
  const bio = row.bio!.trim();
  const skills = Array.isArray(row.skills)
    ? row.skills.filter((skill) => skill.trim()).slice(0, 4)
    : [];
  const proofScore =
    typeof row.integrity_score === "number" &&
    Number.isFinite(row.integrity_score)
      ? Math.round(row.integrity_score)
      : null;

  return {
    id,
    profileSlug: row.profile_slug!.trim(),
    fullName,
    initials: getPublicCandidateInitials(identity),
    roleTitle,
    bioSnippet: truncateBio(bio),
    skills,
    proofScore,
    avatarUrl: row.avatar_url?.trim() || null,
    hasGitHubRepos:
      row.has_github_repos === true || Boolean(row.portfolio_url?.trim()),
  };
}

function parseFeaturedBuildersPayload(payload: unknown): FeaturedBuilder[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((row) =>
      mapFeaturedBuilderRow(
        row && typeof row === "object" ? (row as FeaturedBuilderRow) : {}
      )
    )
    .filter((builder): builder is FeaturedBuilder => builder !== null);
}

export async function fetchFeaturedBuilders(
  supabase: SupabaseClient,
  limit = 6
): Promise<FeaturedBuilder[]> {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_featured_builders",
    { limit_count: limit }
  );

  if (!rpcError && rpcData) {
    return parseFeaturedBuildersPayload(rpcData);
  }

  if (rpcError) {
    console.warn(
      "[featured-builders] rpc failed, falling back to select:",
      rpcError.message
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, profile_slug, full_name, job_title, bio, skills, avatar_url, codename_alias, integrity_score, portfolio_url, youtube_url, updated_at"
    )
    .eq("is_featured", true)
    .eq("is_visible_in_pool", true)
    .not("profile_slug", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[featured-builders] select failed:", error.message);
    return [];
  }

  return parseFeaturedBuildersPayload(data);
}
