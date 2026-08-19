import type { SupabaseClient } from "@supabase/supabase-js";
import { buildUniqueProfileSlug } from "@/lib/profile-slug";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";
import { normalizeAvailabilityStatus } from "@/lib/availability-status";
import {
  normalizeCandidateTimezone,
  normalizeWorkPreference,
} from "@/lib/work-preference";
import { normalizeGitHubUrl } from "@/lib/validate-github-url";

export type CandidateProfileSaveInput = {
  fullName: string;
  jobTitle: string;
  bio: string;
  university: string;
  major: string;
  degree: string;
  skills: string[] | string | null | undefined;
  portfolioUrl: string;
  youtubeUrl: string;
  experienceLevel: string;
  availabilityStatus: string;
  workPreference: string;
  candidateTimezone: string;
  isVisibleInPool: boolean;
  gradYear: string;
};

type PersistOptions = {
  existingProfileSlug?: string | null;
};

type ProfilePayload = Record<
  string,
  string | number | boolean | string[] | null
>;

function nullIfEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeSkillsForDb(
  skills: string[] | string | null | undefined
): string[] {
  if (Array.isArray(skills)) {
    return skills.map((skill) => skill.trim()).filter(Boolean);
  }

  if (typeof skills === "string") {
    return skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
  }

  return [];
}

export function buildCandidateProfileUpdatePayload(
  input: CandidateProfileSaveInput,
  userId: string,
  options?: PersistOptions
): ProfilePayload {
  const parsedGradYear = Number.parseInt(input.gradYear, 10);
  const existingSlug = options?.existingProfileSlug?.trim();

  const payload: ProfilePayload = {
    full_name: nullIfEmpty(input.fullName),
    job_title: nullIfEmpty(input.jobTitle),
    bio: nullIfEmpty(input.bio),
    university: nullIfEmpty(input.university),
    major: nullIfEmpty(input.major),
    degree: nullIfEmpty(input.degree),
    skills: normalizeSkillsForDb(input.skills),
    portfolio_url: nullIfEmpty(normalizeGitHubUrl(input.portfolioUrl)),
    youtube_url: nullIfEmpty(input.youtubeUrl),
    experience_level: nullIfEmpty(input.experienceLevel),
    availability_status: normalizeAvailabilityStatus(input.availabilityStatus),
    work_preference: normalizeWorkPreference(input.workPreference),
    timezone: normalizeCandidateTimezone(input.candidateTimezone),
    is_visible_in_pool: Boolean(input.isVisibleInPool),
    graduation_year: Number.isFinite(parsedGradYear) ? parsedGradYear : null,
  };

  if (existingSlug) {
    payload.profile_slug = existingSlug;
  } else {
    payload.profile_slug = buildUniqueProfileSlug(input.fullName, userId);
  }

  return payload;
}

function isMissingColumnError(error: { message?: string; code?: string } | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    (error.message?.includes("does not exist") ?? false)
  );
}

function isUniqueViolation(error: { code?: string } | null) {
  return error?.code === "23505";
}

function isRowLevelSecurityError(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42501" ||
    (error?.message?.toLowerCase().includes("row-level security") ?? false)
  );
}

function formatPersistError(error: { message?: string; code?: string } | null): string {
  if (!error) {
    return "Could not save profile. Please try again.";
  }

  if (isRowLevelSecurityError(error)) {
    return "Could not save profile: permission denied. Ask an admin to apply profiles RLS migration 0037.";
  }

  if (isUniqueViolation(error)) {
    return "Could not save profile: profile URL slug conflict. Try again.";
  }

  return error.message?.trim() || "Could not save profile. Please try again.";
}

async function runProfileWrite(
  supabase: SupabaseClient,
  userId: string,
  payload: ProfilePayload,
  mode: "update" | "upsert"
) {
  if (mode === "update") {
    return supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId)
      .select("*")
      .maybeSingle();
  }

  return supabase
    .from("profiles")
    .upsert({ id: userId, ...payload }, { onConflict: "id" })
    .select("*")
    .maybeSingle();
}

export async function persistCandidateProfile(
  supabase: SupabaseClient,
  userId: string,
  payload: ProfilePayload
): Promise<{
  data: Record<string, unknown> | null;
  error: { message?: string; code?: string } | null;
  userMessage: string | null;
}> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    return {
      data: null,
      error: sessionError,
      userMessage: sessionError.message,
    };
  }

  if (!session?.user?.id) {
    return {
      data: null,
      error: { message: "No active session. Please sign in again." },
      userMessage: "You must be logged in to save your profile.",
    };
  }

  if (session.user.id !== userId) {
    return {
      data: null,
      error: { message: "Session user does not match profile owner." },
      userMessage: "Could not save profile for this account.",
    };
  }

  let attemptPayload: ProfilePayload = { ...payload };
  const optionalColumnKeys = [
    "profile_slug",
    "availability_status",
    "experience_level",
    "university",
    "degree",
    "major",
    "youtube_url",
    "work_preference",
    "timezone",
    "is_visible_in_pool",
    "graduation_year",
  ] as const;

  for (let attempt = 0; attempt <= optionalColumnKeys.length + 2; attempt += 1) {
    let result = await runProfileWrite(supabase, userId, attemptPayload, "update");

    if (!result.error && !result.data) {
      result = await runProfileWrite(supabase, userId, attemptPayload, "upsert");
    }

    if (!result.error && result.data) {
      return { data: result.data, error: null, userMessage: null };
    }

    if (
      result.error &&
      !isMissingColumnError(result.error) &&
      !isUniqueViolation(result.error) &&
      !isSupabaseSchemaError(result.error)
    ) {
      return {
        data: null,
        error: result.error,
        userMessage: formatPersistError(result.error),
      };
    }

    if (result.error && isUniqueViolation(result.error) && attemptPayload.profile_slug) {
      const { profile_slug: _removed, ...rest } = attemptPayload;
      attemptPayload = rest;
      continue;
    }

    if (
      result.error &&
      isMissingColumnError(result.error) &&
      attempt < optionalColumnKeys.length
    ) {
      const keyToDrop = optionalColumnKeys[attempt];
      if (keyToDrop in attemptPayload) {
        const { [keyToDrop]: _removed, ...rest } = attemptPayload;
        attemptPayload = rest;
        continue;
      }
    }

    if (result.error && isSupabaseSchemaError(result.error) && attempt < optionalColumnKeys.length + 1) {
      const keyToDrop = optionalColumnKeys[Math.min(attempt, optionalColumnKeys.length - 1)];
      if (keyToDrop in attemptPayload) {
        const { [keyToDrop]: _removed, ...rest } = attemptPayload;
        attemptPayload = rest;
        continue;
      }
    }

    return {
      data: null,
      error: result.error,
      userMessage: formatPersistError(result.error),
    };
  }

  return {
    data: null,
    error: { message: "Profile save failed after retries." },
    userMessage: "Could not save profile. Please try again.",
  };
}
