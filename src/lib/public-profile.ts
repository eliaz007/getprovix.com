import {
  getPublicCandidateDisplayName,
  getPublicCandidateInitials,
  getPublicCandidateLocation,
} from "@/lib/candidate-anonymization";
import { createServiceRoleClient } from "@/lib/admin-access";
import { createClient } from "@/utils/supabase/server";
import { isVerifiedOnProvix } from "@/lib/published-candidate-profile";
import {
  normalizeCandidateTimezone,
  normalizeWorkPreference,
} from "@/lib/work-preference";

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

function mapRowToPublicProfile(row: PublicProfileRow): PublicCandidateProfile {
  const portfolioUrl = row.portfolio_url?.trim() || null;
  const youtubeUrl = row.youtube_url?.trim() || null;
  const skills = Array.isArray(row.skills)
    ? row.skills.filter((skill) => skill.trim())
    : [];

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
    university: row.university?.trim() || null,
    major: row.major?.trim() || null,
    school: row.school?.trim() || null,
    experienceLevel: row.experience_level?.trim() || null,
    location: getPublicCandidateLocation(identity),
    workPreference: normalizeWorkPreference(row.work_preference),
    timezone: normalizeCandidateTimezone(row.timezone),
    hasProofOfWork: Boolean(portfolioUrl || youtubeUrl),
    isVerifiedOnProvix: isVerifiedOnProvix(row),
    hasGitHubRepos:
      row.has_github_repos === true || Boolean(portfolioUrl),
    integrityScore:
      typeof row.integrity_score === "number" ? row.integrity_score : null,
  };
}

async function fetchViaRpc(
  slug: string
): Promise<PublicCandidateProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_profile_by_slug", {
    slug,
  });

  if (error) {
    console.error("[public-profile] rpc failed:", error);
    return null;
  }

  if (!data || typeof data !== "object") {
    return null;
  }

  return mapRowToPublicProfile(data as PublicProfileRow);
}

async function fetchViaServiceRole(
  slug: string
): Promise<PublicCandidateProfile | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, profile_slug, full_name, name, first_name, last_name, job_title, headline, bio, skills, portfolio_url, youtube_url, codename_alias, availability_status, availability, university, major, school, degree, experience_level, country, timezone, work_preference, is_visible_in_pool, integrity_score"
    )
    .eq("profile_slug", slug)
    .eq("is_visible_in_pool", true)
    .maybeSingle();

  if (error) {
    console.error("[public-profile] service role lookup failed:", error);
    return null;
  }

  if (!data) {
    return null;
  }

  return mapRowToPublicProfile(data as PublicProfileRow);
}

export async function getPublicProfileBySlug(
  username: string
): Promise<PublicCandidateProfile | null> {
  const slug = username.trim().toLowerCase();
  if (!slug) {
    return null;
  }

  const viaRpc = await fetchViaRpc(slug);
  if (viaRpc) {
    return viaRpc;
  }

  return fetchViaServiceRole(slug);
}
