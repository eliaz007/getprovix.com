import type { SupabaseClient } from "@supabase/supabase-js";
import { buildUniqueProfileSlug } from "@/lib/profile-slug";
import { isSupabaseSchemaError, findMentionedColumn } from "@/lib/supabase-schema-errors";
import { normalizeAvailabilityStatus } from "@/lib/availability-status";
import {
  normalizeCandidateTimezone,
  normalizeWorkPreference,
} from "@/lib/work-preference";
import { formatGpa } from "@/lib/gpa";
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
  gpa: string;
  keyAccomplishments: string;
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
    school: nullIfEmpty(input.university),
    major: nullIfEmpty(input.major),
    degree: nullIfEmpty(input.degree),
    skills: normalizeSkillsForDb(input.skills),
    user_id: userId,
    portfolio_url: nullIfEmpty(normalizeGitHubUrl(input.portfolioUrl)),
    youtube_url: nullIfEmpty(input.youtubeUrl),
    experience_level: nullIfEmpty(input.experienceLevel),
    availability_status: normalizeAvailabilityStatus(input.availabilityStatus),
    work_preference: normalizeWorkPreference(input.workPreference),
    timezone: normalizeCandidateTimezone(input.candidateTimezone),
    is_visible_in_pool: Boolean(input.isVisibleInPool),
    visible_to_employers: Boolean(input.isVisibleInPool),
    graduation_year: Number.isFinite(parsedGradYear) ? parsedGradYear : null,
    gpa: nullIfEmpty(formatGpa(input.gpa)),
    key_accomplishments: nullIfEmpty(input.keyAccomplishments),
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
    const byId = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId)
      .select("*")
      .maybeSingle();

    if (byId.data || byId.error) {
      return byId;
    }

    const byUserId = await supabase
      .from("profiles")
      .update(payload)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();

    if (
      byUserId.error &&
      (isMissingColumnError(byUserId.error) ||
        isSupabaseSchemaError(byUserId.error))
    ) {
      return byId;
    }

    return byUserId;
  }

  return supabase
    .from("profiles")
    .upsert({ id: userId, ...payload }, { onConflict: "id" })
    .select("*")
    .maybeSingle();
}

export async function persistCandidatePoolVisibility(
  supabase: SupabaseClient,
  userId: string,
  isVisibleInPool: boolean
): Promise<{
  error: { message?: string; code?: string } | null;
  userMessage: string | null;
}> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    return {
      error: sessionError,
      userMessage: sessionError.message,
    };
  }

  if (!session?.user?.id) {
    return {
      error: { message: "No active session. Please sign in again." },
      userMessage: "You must be logged in to update visibility.",
    };
  }

  if (session.user.id !== userId) {
    return {
      error: { message: "Session user does not match profile owner." },
      userMessage: "Could not update visibility for this account.",
    };
  }

  const payload: ProfilePayload = {
    is_visible_in_pool: isVisibleInPool,
    visible_to_employers: isVisibleInPool,
  };

  let { error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId);

  if (
    error &&
    (isMissingColumnError(error) || isSupabaseSchemaError(error))
  ) {
    const mentioned = findMentionedColumn(error, [
      "visible_to_employers",
    ]);
    if (mentioned) {
      ({ error } = await supabase
        .from("profiles")
        .update({ is_visible_in_pool: isVisibleInPool })
        .eq("id", userId));
    }
  }

  if (error) {
    return { error, userMessage: formatPersistError(error) };
  }

  return { error: null, userMessage: null };
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
  const maxAttempts = Object.keys(attemptPayload).length + 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let result = await runProfileWrite(supabase, userId, attemptPayload, "update");

    if (!result.error && !result.data) {
      result = await runProfileWrite(supabase, userId, attemptPayload, "upsert");
    }

    if (!result.error && result.data) {
      const educationPatch: ProfilePayload = {};
      for (const key of [
        "university",
        "school",
        "major",
        "degree",
        "gpa",
        "graduation_year",
      ] as const) {
        if (key in attemptPayload) {
          educationPatch[key] = attemptPayload[key];
        }
      }

      if (Object.keys(educationPatch).length > 0) {
        await supabase
          .from("profiles")
          .update(educationPatch)
          .eq("user_id", userId);
      }

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
      (isMissingColumnError(result.error) || isSupabaseSchemaError(result.error))
    ) {
      const keyToDrop = findMentionedColumn(
        result.error,
        Object.keys(attemptPayload)
      );
      if (keyToDrop && keyToDrop in attemptPayload) {
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
