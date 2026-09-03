import {
  getPublicCandidateDisplayName,
  getPublicCandidateInitials,
  getPublicCandidateLocation,
} from "@/lib/candidate-anonymization";
import { createServiceRoleClient } from "@/lib/admin-access";
import { createClient } from "@/utils/supabase/server";
import { isVerifiedOnProvix } from "@/lib/published-candidate-profile";
import { clampScore0to100 } from "@/lib/score-scale";
import { formatGpa } from "@/lib/gpa";
import {
  educationFromProfileRow,
  hydrateRowsWithEducation,
} from "@/lib/talent-pool-profiles";
import {
  findMentionedColumn,
  isSupabaseSchemaError,
} from "@/lib/supabase-schema-errors";
import {
  normalizeCandidateTimezone,
  normalizeWorkPreference,
} from "@/lib/work-preference";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicCandidateProfile = {
  id: string;
  profileSlug: string;
  displayName: string;
  initials: string;
  jobTitle: string | null;
  bio: string | null;
  skills: string[];
  youtubeUrl: string | null;
  availabilityStatus: string | null;
  university: string | null;
  major: string | null;
  school: string | null;
  gpa: string | null;
  graduationYear: string | null;
  experienceLevel: string | null;
  location: string;
  workPreference: string;
  timezone: string;
  hasProofOfWork: boolean;
  isVerifiedOnProvix: boolean;
  hasGitHubRepos: boolean;
  integrityScore: number | null;
};

type PublicProfileRow = {
  id: string;
  profile_slug?: string | null;
  full_name?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  job_title?: string | null;
  headline?: string | null;
  bio?: string | null;
  skills?: string[] | null;
  portfolio_url?: string | null;
  youtube_url?: string | null;
  codename_alias?: string | null;
  availability_status?: string | null;
  availability?: string | null;
  university?: string | null;
  major?: string | null;
  school?: string | null;
  degree?: string | null;
  gpa?: string | number | null;
  graduation_year?: string | number | null;
  experience_level?: string | null;
  country?: string | null;
  timezone?: string | null;
  work_preference?: string | null;
  is_visible_in_pool?: boolean | null;
  integrity_score?: number | null;
  has_github_repos?: boolean | null;
};

function formatExternalUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function unwrapRpcProfile(data: unknown): PublicProfileRow | null {
  let payload: unknown = data;

  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }

  if (Array.isArray(payload)) {
    payload = payload[0];
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  return payload as PublicProfileRow;
}

function mapRowToPublicProfile(row: PublicProfileRow): PublicCandidateProfile {
  const portfolioUrl = row.portfolio_url?.trim() || null;
  const youtubeUrl = row.youtube_url?.trim() || null;
  const skills = Array.isArray(row.skills)
    ? row.skills.filter((skill) => skill.trim())
    : [];
  const education = educationFromProfileRow(
    row as unknown as Record<string, unknown>
  );

  const identity = {
    codenameAlias: row.codename_alias,
    fullName: row.full_name,
    candidateId: row.id,
    country: row.country,
    timezone: row.timezone,
  };

  return {
    id: row.id,
    profileSlug: row.profile_slug?.trim() || row.id,
    displayName: getPublicCandidateDisplayName(identity),
    initials: getPublicCandidateInitials(identity),
    jobTitle: row.job_title?.trim() || null,
    bio: row.bio?.trim() || null,
    skills,
    youtubeUrl: youtubeUrl ? formatExternalUrl(youtubeUrl) : null,
    availabilityStatus: row.availability_status?.trim() || null,
    university: education.university || null,
    major: education.major || null,
    school: row.school?.trim() || education.university || null,
    gpa: formatGpa(education.gpa) || null,
    graduationYear: education.graduationYear || null,
    experienceLevel: row.experience_level?.trim() || null,
    location: getPublicCandidateLocation(identity),
    workPreference: normalizeWorkPreference(row.work_preference),
    timezone: normalizeCandidateTimezone(row.timezone),
    hasProofOfWork: Boolean(portfolioUrl || youtubeUrl),
    isVerifiedOnProvix: isVerifiedOnProvix(row),
    hasGitHubRepos:
      row.has_github_repos === true || Boolean(portfolioUrl),
    integrityScore:
      typeof row.integrity_score === "number"
        ? clampScore0to100(row.integrity_score)
        : null,
  };
}

const PUBLIC_PROFILE_RPC = "get_public_profile_by_slug";

// 0052 SQL argument name is `slug`. Older overloads used p_slug / username.
const PUBLIC_PROFILE_RPC_ARG_KEYS = ["slug", "p_slug", "username"] as const;

const PUBLIC_PROFILE_SELECT_COLUMNS = [
  "id",
  "user_id",
  "profile_slug",
  "full_name",
  "name",
  "first_name",
  "last_name",
  "job_title",
  "headline",
  "bio",
  "skills",
  "portfolio_url",
  "youtube_url",
  "codename_alias",
  "availability_status",
  "availability",
  "university",
  "major",
  "school",
  "degree",
  "gpa",
  "graduation_year",
  "experience_level",
  "country",
  "timezone",
  "work_preference",
  "is_visible_in_pool",
  "integrity_score",
] as const;

function isMissingRpcFunctionError(error: {
  code?: string;
  message?: string;
}): boolean {
  const message = error.message ?? "";
  return (
    error.code === "PGRST202" ||
    error.code === "PGRST203" ||
    message.includes("Could not find the function") ||
    (message.includes(PUBLIC_PROFILE_RPC) &&
      message.toLowerCase().includes("schema cache"))
  );
}

async function fetchViaRpc(
  slug: string
): Promise<PublicCandidateProfile | null> {
  const supabase = await createClient();
  let lastError: { code?: string; message?: string } | null = null;

  for (const argKey of PUBLIC_PROFILE_RPC_ARG_KEYS) {
    const { data, error } = await supabase.rpc(PUBLIC_PROFILE_RPC, {
      [argKey]: slug,
    });

    if (!error) {
      const row = unwrapRpcProfile(data);
      return row ? mapRowToPublicProfile(row) : null;
    }

    lastError = error;
    if (!isMissingRpcFunctionError(error)) {
      break;
    }
  }

  if (lastError) {
    console.error("[public-profile] rpc failed:", lastError);
  }

  return null;
}

async function selectVisibleProfileBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<Record<string, unknown> | null> {
  let columns: string[] = [...PUBLIC_PROFILE_SELECT_COLUMNS];

  for (let attempt = 0; attempt < PUBLIC_PROFILE_SELECT_COLUMNS.length; attempt += 1) {
    const { data, error } = await supabase
      .from("profiles")
      .select(columns.join(", "))
      .eq("profile_slug", slug)
      .eq("is_visible_in_pool", true)
      .maybeSingle();

    if (!error) {
      return (data as Record<string, unknown> | null) ?? null;
    }

    if (!isSupabaseSchemaError(error)) {
      console.error("[public-profile] service role lookup failed:", error);
      break;
    }

    const mentioned = findMentionedColumn(error, columns);
    if (mentioned) {
      columns = columns.filter((column) => column !== mentioned);
      continue;
    }

    break;
  }

  const fallback = await supabase
    .from("profiles")
    .select("*")
    .eq("profile_slug", slug)
    .eq("is_visible_in_pool", true)
    .maybeSingle();

  if (fallback.error) {
    console.error(
      "[public-profile] service role lookup failed:",
      fallback.error
    );
    return null;
  }

  return (fallback.data as Record<string, unknown> | null) ?? null;
}

async function fetchViaServiceRole(
  slug: string
): Promise<PublicCandidateProfile | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return null;
  }

  const row = await selectVisibleProfileBySlug(supabase, slug);
  if (!row) {
    return null;
  }

  const [hydrated] = await hydrateRowsWithEducation(supabase, [row]);
  return mapRowToPublicProfile(hydrated as PublicProfileRow);
}

export async function getPublicProfileBySlug(
  username: string
): Promise<PublicCandidateProfile | null> {
  const slug = username.trim().toLowerCase();
  if (!slug) {
    return null;
  }

  const viaRpc = await fetchViaRpc(slug);
  const rpcHasEducation = Boolean(
    viaRpc?.university ||
      viaRpc?.major ||
      viaRpc?.school ||
      viaRpc?.gpa ||
      viaRpc?.graduationYear
  );

  if (viaRpc && rpcHasEducation) {
    return viaRpc;
  }

  const viaServiceRole = await fetchViaServiceRole(slug);
  if (!viaServiceRole) {
    return viaRpc;
  }

  if (!viaRpc) {
    return viaServiceRole;
  }

  return {
    ...viaServiceRole,
    university: viaServiceRole.university || viaRpc.university,
    major: viaServiceRole.major || viaRpc.major,
    school: viaServiceRole.school || viaRpc.school,
    gpa: formatGpa(viaServiceRole.gpa) || formatGpa(viaRpc.gpa) || null,
    graduationYear: viaServiceRole.graduationYear || viaRpc.graduationYear,
  };
}
