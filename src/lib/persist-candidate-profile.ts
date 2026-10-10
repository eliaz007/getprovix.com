import type { SupabaseClient } from "@supabase/supabase-js";
import { buildUniqueProfileSlug } from "@/lib/profile-slug";
import { isSupabaseSchemaError, findMentionedColumn } from "@/lib/supabase-schema-errors";
import { normalizeAvailabilityStatus } from "@/lib/availability-status";
import {
  normalizeCandidateTimezone,
  normalizeWorkPreference,
} from "@/lib/work-preference";
import {
  getContractDetailsValidationError,
  normalizeContractHourlyRate,
  normalizeContractHoursPerWeek,
  normalizeOpenToContract,
  normalizeOpenToFulltime,
} from "@/lib/contract-availability";
import { formatGpa } from "@/lib/gpa";
import { normalizeGitHubUrl } from "@/lib/validate-github-url";
import {
  getCandidateSkillsValidationError,
  parseCandidateSkills,
} from "@/lib/candidate-skills";
import { CANDIDATE_BIO_LIMIT_TEXT, getCandidateBioValidationError } from "@/lib/candidate-bio";
import {
  getEducationValidationError,
  parseEducationEntries,
  primaryEducationFields,
  serializeEducationEntries,
  type EducationEntry,
} from "@/lib/candidate-education";
import {
  canEnableTalentPoolVisibility,
  formatMarketplacePublishSaveBlockedMessage,
  hasQualifyingTalentPoolAudit,
  isTalentPoolGitHubLinked,
  isTalentPoolOwnershipVerified,
  listMarketplacePublishGateFailures,
  resolveTalentPoolAuditedRepoUrl,
  talentPoolVisibilityFailureMessage,
} from "@/lib/talent-pool-visibility";
import { syncGitHubIdentityToProfile } from "@/lib/github-identity";
import { parseProductionAuditFromProfileRow } from "@/lib/production-audit";
import {
  meetsTalentPoolAutoPublishCriteria,
  talentPoolMetadataDefaults,
  type PublishedCandidateProfileRow,
} from "@/lib/published-candidate-profile";

export type CandidateProfileSaveInput = {
  fullName: string;
  jobTitle: string;
  bio: string;
  university: string;
  major: string;
  degree: string;
  skills: string[] | string | null | undefined;
  education?: EducationEntry[] | unknown;
  isSelfTaught?: boolean;
  portfolioUrl: string;
  youtubeUrl: string;
  experienceLevel: string;
  availabilityStatus: string;
  workPreference: string;
  candidateTimezone: string;
  openToFulltime: boolean;
  openToContract: boolean;
  contractHoursPerWeek: string;
  contractHourlyRate: number | string | null;
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
  | string
  | number
  | boolean
  | string[]
  | Array<Record<string, string>>
  | null
>;

function nullIfEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeSkillsForDb(
  skills: string[] | string | null | undefined
): string[] {
  return parseCandidateSkills(skills);
}

export function buildCandidateProfileUpdatePayload(
  input: CandidateProfileSaveInput,
  userId: string,
  options?: PersistOptions
): ProfilePayload {
  const educationEntries = serializeEducationEntries(
    parseEducationEntries(input.education)
  );
  const primaryEducation = primaryEducationFields(educationEntries);
  const parsedGradYear = Number.parseInt(primaryEducation.graduationYear, 10);
  const existingSlug = options?.existingProfileSlug?.trim();
  const institution = primaryEducation.institution;
  const fieldOfStudy = primaryEducation.fieldOfStudy;

  const openToContract = normalizeOpenToContract(input.openToContract);
  const contractHours = openToContract
    ? normalizeContractHoursPerWeek(input.contractHoursPerWeek)
    : "";
  const contractRate = openToContract
    ? normalizeContractHourlyRate(input.contractHourlyRate)
    : null;
  // Positive rate only — 0 is treated as unset when contract is open.
  const persistedContractRate =
    contractRate != null && contractRate > 0 ? contractRate : null;

  const metadataDefaults = talentPoolMetadataDefaults({
    work_preference: input.workPreference,
    timezone: input.candidateTimezone,
    availability_status: input.availabilityStatus,
  });

  const payload: ProfilePayload = {
    full_name: nullIfEmpty(input.fullName),
    job_title: nullIfEmpty(input.jobTitle),
    bio: nullIfEmpty(input.bio),
    university: nullIfEmpty(institution),
    school: nullIfEmpty(institution),
    major: nullIfEmpty(fieldOfStudy),
    degree: nullIfEmpty(primaryEducation.credentialType),
    education: educationEntries,
    is_self_taught: Boolean(input.isSelfTaught),
    skills: normalizeSkillsForDb(input.skills),
    user_id: userId,
    portfolio_url: nullIfEmpty(normalizeGitHubUrl(input.portfolioUrl)),
    youtube_url: nullIfEmpty(input.youtubeUrl),
    experience_level: nullIfEmpty(input.experienceLevel),
    availability_status: normalizeAvailabilityStatus(
      input.availabilityStatus || metadataDefaults.availability_status
    ),
    work_preference: normalizeWorkPreference(
      input.workPreference || metadataDefaults.work_preference
    ),
    timezone: normalizeCandidateTimezone(
      input.candidateTimezone || metadataDefaults.timezone
    ),
    open_to_fulltime: normalizeOpenToFulltime(input.openToFulltime),
    open_to_contract: openToContract,
    contract_hours_per_week: contractHours || null,
    contract_hourly_rate: persistedContractRate,
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

/** Structured log fields for Supabase / unknown errors (avoids console `{}`). */
export function serializePersistError(error: unknown): Record<string, unknown> {
  if (error == null) {
    return { error: null };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    let json: string | null = null;
    try {
      json = JSON.stringify(error);
    } catch {
      json = "[unserializable]";
    }
    return {
      message: typeof record.message === "string" ? record.message : undefined,
      details: record.details,
      hint: record.hint,
      code: record.code,
      status: record.status ?? record.statusCode,
      json,
    };
  }

  return { error: String(error) };
}

function formatPersistError(
  error: { message?: string; details?: string; code?: string } | null
): string {
  if (!error) {
    return "Could not save profile. Please try again.";
  }

  if (isRowLevelSecurityError(error)) {
    return "Could not save profile: permission denied. Ask an admin to apply profiles RLS migration 0037.";
  }

  if (isUniqueViolation(error)) {
    return "Could not save profile: profile URL slug conflict. Try again.";
  }

  const message = (error.message ?? "").toLowerCase();
  const details = (error.details ?? "").toLowerCase();
  const combined = `${message} ${details}`;

  if (
    combined.includes("profiles_candidate_bio_length_check") ||
    (error.code === "23514" && combined.includes("bio"))
  ) {
    return CANDIDATE_BIO_LIMIT_TEXT;
  }

  if (
    combined.includes("profiles_contract_hourly_rate_check") ||
    (error.code === "23514" && combined.includes("contract_hourly_rate"))
  ) {
    return "Target payout rate must be a whole-dollar amount of $0 or more.";
  }

  if (
    combined.includes("profiles_contract_hours_per_week_check") ||
    (error.code === "23514" && combined.includes("contract_hours_per_week"))
  ) {
    return "Select a valid weekly bandwidth before saving contract availability.";
  }

  if (
    combined.includes("contract_hourly_rate") &&
    (combined.includes("invalid input") ||
      combined.includes("type") ||
      error.code === "22P02")
  ) {
    return "Target payout rate must be a whole number (no currency symbols).";
  }

  return error.message?.trim() || "Could not save profile. Please try again.";
}

/** Ensure contract_hourly_rate is an integer or null before writing to Postgres. */
function coerceContractHourlyRateInPayload(payload: ProfilePayload): ProfilePayload {
  if (!("contract_hourly_rate" in payload)) {
    return payload;
  }

  const normalized = normalizeContractHourlyRate(
    payload.contract_hourly_rate as number | string | null
  );
  const persisted =
    normalized != null && normalized > 0 ? normalized : null;

  return {
    ...payload,
    contract_hourly_rate: persisted,
  };
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
  try {
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

    if (isVisibleInPool) {
      // Keep profiles.github_* in sync with the auth identity before gating.
      // Local UI can already show "Linked" after a client-side merge even when
      // the DB row was stale — without this, the toggle fails with Connect GitHub.
      const syncedLink = await syncGitHubIdentityToProfile(
        supabase,
        session.user
      );

      const visibilitySelectFull =
        "id, user_id, github_verified, github_username, verification_status, is_audit_verified, production_score, audit_score, audit_breakdown, portfolio_url";
      const visibilitySelectFallback =
        "id, user_id, github_verified, github_username, verification_status, production_score, audit_score, portfolio_url";

      async function loadVisibilityProfile(select: string) {
        const byId = await supabase
          .from("profiles")
          .select(select)
          .eq("id", userId)
          .maybeSingle();
        if (!byId.error && byId.data) {
          return byId.data as Record<string, unknown>;
        }
        const byUserId = await supabase
          .from("profiles")
          .select(select)
          .eq("user_id", userId)
          .maybeSingle();
        if (!byUserId.error && byUserId.data) {
          return byUserId.data as Record<string, unknown>;
        }
        return null;
      }

      let profile =
        (await loadVisibilityProfile(visibilitySelectFull)) ??
        (await loadVisibilityProfile(visibilitySelectFallback));

      const history = await supabase
        .from("production_audit_history")
        .select("production_score, audited_repo_url")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const historyScore =
        typeof history.data?.production_score === "number"
          ? history.data.production_score
          : null;
      const historyRepoUrl =
        typeof history.data?.audited_repo_url === "string"
          ? history.data.audited_repo_url
          : null;

      const githubUsername =
        (typeof profile?.github_username === "string" &&
        profile.github_username.trim()
          ? String(profile.github_username)
          : null) ??
        syncedLink?.github_username ??
        null;
      const githubVerified = isTalentPoolGitHubLinked({
        githubVerified:
          profile?.github_verified === true ||
          syncedLink?.github_verified === true,
        githubUsername,
      });
      const parsedAudit = parseProductionAuditFromProfileRow(
        profile
          ? {
              production_score:
                typeof profile.production_score === "number" ||
                typeof profile.production_score === "string"
                  ? profile.production_score
                  : null,
              audit_breakdown: profile.audit_breakdown,
              is_audit_verified:
                typeof profile.is_audit_verified === "boolean"
                  ? profile.is_audit_verified
                  : null,
              verification_status:
                typeof profile.verification_status === "string"
                  ? profile.verification_status
                  : null,
            }
          : null
      );
      const auditedRepoUrl = resolveTalentPoolAuditedRepoUrl({
        auditedRepoUrl: parsedAudit?.breakdown.audited_repo_url,
        auditBreakdown: profile?.audit_breakdown,
        portfolioUrl:
          typeof profile?.portfolio_url === "string"
            ? profile.portfolio_url
            : null,
        historyRepoUrl,
      });
      const ownershipVerified = isTalentPoolOwnershipVerified({
        verificationStatus:
          typeof profile?.verification_status === "string"
            ? profile.verification_status
            : parsedAudit?.verificationStatus ?? null,
        isAuditVerified:
          profile?.is_audit_verified === true ||
          parsedAudit?.isAuditVerified === true,
        auditedRepoUrl,
        auditBreakdown: profile?.audit_breakdown,
        portfolioUrl:
          typeof profile?.portfolio_url === "string"
            ? profile.portfolio_url
            : null,
        historyRepoUrl,
        githubUsername,
      });
      const scores: Array<number | null | undefined> = [
        typeof profile?.production_score === "number"
          ? profile.production_score
          : null,
        typeof profile?.audit_score === "number" ? profile.audit_score : null,
        parsedAudit?.productionScore ?? null,
        historyScore,
      ];

      if (
        !canEnableTalentPoolVisibility({
          githubVerified,
          ownershipVerified,
          scores,
        })
      ) {
        const message = talentPoolVisibilityFailureMessage({
          githubVerified,
          ownershipVerified,
          scores,
        });
        return {
          error: { message },
          userMessage: message,
        };
      }
    }

    const payload: ProfilePayload = {
      is_visible_in_pool: isVisibleInPool,
      visible_to_employers: isVisibleInPool,
    };

    let { error } = await supabase
      .from("profiles")
      .update(payload)
      .or(`id.eq.${userId},user_id.eq.${userId}`);

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
          .or(`id.eq.${userId},user_id.eq.${userId}`));
      }
    }

    if (error) {
      return { error, userMessage: formatPersistError(error) };
    }

    return { error: null, userMessage: null };
  } catch (error) {
    console.error(
      "[persist-candidate-profile] persistCandidatePoolVisibility failed:",
      error
    );
    const message =
      error instanceof Error
        ? error.message
        : "Could not update visibility. Please try again.";
    return {
      error: { message },
      userMessage: message,
    };
  }
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
  try {
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

    if ("bio" in payload) {
      const bioValue = typeof payload.bio === "string" ? payload.bio : "";
      const bioError = getCandidateBioValidationError(bioValue);
      if (bioError) {
        return {
          data: null,
          error: { message: bioError },
          userMessage: bioError,
        };
      }
    }

    if (payload.open_to_contract === true) {
      const contractDetailsError = getContractDetailsValidationError(
        true,
        typeof payload.contract_hours_per_week === "string"
          ? payload.contract_hours_per_week
          : null,
        typeof payload.contract_hourly_rate === "number"
          ? payload.contract_hourly_rate
          : null
      );
      if (contractDetailsError) {
        return {
          data: null,
          error: { message: contractDetailsError },
          userMessage: contractDetailsError,
        };
      }
    }

    if ("skills" in payload) {
      const parsedSkills = parseCandidateSkills(
        payload.skills as string[] | string | null | undefined
      );
      const skillsError = getCandidateSkillsValidationError(parsedSkills);
      if (skillsError) {
        return {
          data: null,
          error: { message: skillsError },
          userMessage: skillsError,
        };
      }
      payload = { ...payload, skills: parsedSkills };
    }

    if ("education" in payload) {
      const parsedEducation = parseEducationEntries(payload.education);
      const educationError = getEducationValidationError(parsedEducation, {
        isSelfTaught: Boolean(payload.is_self_taught),
      });
      if (educationError) {
        return {
          data: null,
          error: { message: educationError },
          userMessage: educationError,
        };
      }
      payload = {
        ...payload,
        education: serializeEducationEntries(parsedEducation),
      };
    }

    const { data: publishGateProfile } = await supabase
      .from("profiles")
      .select(
        "id, role, full_name, name, first_name, last_name, job_title, headline, bio, skills, github_verified, github_username, verification_status, is_audit_verified, production_score, audit_score, audit_breakdown, portfolio_url, is_visible_in_pool, visible_to_employers"
      )
      .eq("id", userId)
      .maybeSingle();

    const mergedForPublish: PublishedCandidateProfileRow = {
      ...(publishGateProfile ?? {}),
      id: userId,
      full_name:
        typeof payload.full_name === "string"
          ? payload.full_name
          : publishGateProfile?.full_name,
      job_title:
        typeof payload.job_title === "string"
          ? payload.job_title
          : publishGateProfile?.job_title,
      bio:
        typeof payload.bio === "string" ? payload.bio : publishGateProfile?.bio,
      skills:
        Array.isArray(payload.skills)
          ? payload.skills
          : publishGateProfile?.skills,
      github_verified: publishGateProfile?.github_verified === true,
      production_score:
        typeof publishGateProfile?.production_score === "number"
          ? publishGateProfile.production_score
          : null,
      audit_score:
        typeof publishGateProfile?.audit_score === "number"
          ? publishGateProfile.audit_score
          : null,
      role:
        typeof publishGateProfile?.role === "string"
          ? publishGateProfile.role
          : null,
    };

    if (meetsTalentPoolAutoPublishCriteria(mergedForPublish)) {
      const metadata = talentPoolMetadataDefaults({
        work_preference:
          typeof payload.work_preference === "string"
            ? payload.work_preference
            : null,
        timezone: typeof payload.timezone === "string" ? payload.timezone : null,
        availability_status:
          typeof payload.availability_status === "string"
            ? payload.availability_status
            : null,
      });
      payload = {
        ...payload,
        is_visible_in_pool: true,
        visible_to_employers: true,
        work_preference: metadata.work_preference,
        timezone: metadata.timezone,
        availability_status: metadata.availability_status,
      };
    }

    const wantsMarketplaceAvailability =
      payload.open_to_fulltime === true || payload.open_to_contract === true;

    if (wantsMarketplaceAvailability) {
      const profileScores = [
        typeof publishGateProfile?.production_score === "number"
          ? publishGateProfile.production_score
          : null,
        typeof publishGateProfile?.audit_score === "number"
          ? publishGateProfile.audit_score
          : null,
      ];

      let historyScore: number | null = null;
      if (!hasQualifyingTalentPoolAudit(...profileScores)) {
        const history = await supabase
          .from("production_audit_history")
          .select("production_score")
          .eq("user_id", userId)
          .gte("production_score", 75)
          .limit(1)
          .maybeSingle();
        if (typeof history.data?.production_score === "number") {
          historyScore = history.data.production_score;
        }
      }

      const githubUsername =
        typeof publishGateProfile?.github_username === "string"
          ? publishGateProfile.github_username
          : null;
      const githubVerified = isTalentPoolGitHubLinked({
        githubVerified: publishGateProfile?.github_verified === true,
        githubUsername,
      });
      const publishAudit = parseProductionAuditFromProfileRow(publishGateProfile);
      const ownershipVerified = isTalentPoolOwnershipVerified({
        verificationStatus:
          typeof publishGateProfile?.verification_status === "string"
            ? publishGateProfile.verification_status
            : null,
        isAuditVerified:
          publishGateProfile?.is_audit_verified === true ||
          publishAudit?.isAuditVerified === true,
        auditedRepoUrl: resolveTalentPoolAuditedRepoUrl({
          auditedRepoUrl: publishAudit?.breakdown.audited_repo_url,
          auditBreakdown: publishGateProfile?.audit_breakdown,
          portfolioUrl:
            typeof publishGateProfile?.portfolio_url === "string"
              ? publishGateProfile.portfolio_url
              : typeof payload.portfolio_url === "string"
                ? payload.portfolio_url
                : null,
        }),
        auditBreakdown: publishGateProfile?.audit_breakdown,
        portfolioUrl:
          typeof publishGateProfile?.portfolio_url === "string"
            ? publishGateProfile.portfolio_url
            : typeof payload.portfolio_url === "string"
              ? payload.portfolio_url
              : null,
        githubUsername,
      });
      const isVisibleInPool =
        payload.is_visible_in_pool === true ||
        publishGateProfile?.is_visible_in_pool === true;

      const publishFailures = listMarketplacePublishGateFailures({
        isVisibleInPool,
        githubVerified,
        ownershipVerified,
        scores: [
          ...profileScores,
          publishAudit?.productionScore ?? null,
          historyScore,
        ],
      });

      if (publishFailures.length > 0) {
        const message =
          formatMarketplacePublishSaveBlockedMessage(publishFailures);
        return {
          data: null,
          error: { message },
          userMessage: message,
        };
      }
    }

    let attemptPayload: ProfilePayload = coerceContractHourlyRateInPayload({
      ...payload,
    });
    const maxAttempts = Object.keys(attemptPayload).length + 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let result = await runProfileWrite(supabase, userId, attemptPayload, "update");

      if (!result.error && !result.data) {
        result = await runProfileWrite(supabase, userId, attemptPayload, "upsert");
      }

      if (result.error) {
        console.error(
          "[persist-candidate-profile] profile write failed",
          serializePersistError(result.error),
          {
            attempt,
            modeHint: "update/upsert",
            contract_hourly_rate: attemptPayload.contract_hourly_rate,
            contract_hours_per_week: attemptPayload.contract_hours_per_week,
            open_to_contract: attemptPayload.open_to_contract,
          }
        );
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
          "education",
          "is_self_taught",
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
  } catch (error) {
    console.error(
      "[persist-candidate-profile] persistCandidateProfile failed:",
      error
    );
    const message =
      error instanceof Error
        ? error.message
        : "Could not save profile. Please try again.";
    return {
      data: null,
      error: { message },
      userMessage: message,
    };
  }
}
