import { generateMaskedAliasFromUuid, getCodenameInitials } from "@/lib/alias-generator";
import { getPublicCandidateLocation } from "@/lib/candidate-anonymization";
import {
  isCannedMatchScore,
  scoreTalentMatch,
  type MatchResult,
} from "@/lib/match-heuristic";
import {
  getFitVerdictBadgeClass,
  scoreToFitVerdict,
  type FitVerdict,
} from "@/lib/opportunity-match";
import { isVerifiedOnProvix } from "@/lib/published-candidate-profile";
import { resolvedProfileId } from "@/lib/resolve-candidate-profile";
import { clampScore0to100 } from "@/lib/score-scale";
import { educationFromProfileRow } from "@/lib/talent-pool-profiles";

export const APPLICANT_PROFILE_COLUMNS = [
  "id",
  "user_id",
  "codename_alias",
  "full_name",
  "name",
  "first_name",
  "last_name",
  "contact_email",
  "email",
  "phone",
  "linkedin_url",
  "skills",
  "timezone",
  "country",
  "job_title",
  "headline",
  "bio",
  "experience_level",
  "major",
  "degree",
  "school",
  "university",
  "gpa",
  "graduation_year",
  "portfolio_url",
  "youtube_url",
  "availability_status",
  "availability",
  "work_preference",
  "role",
] as const;

export type ApplicantProfileRow = {
  id?: string;
  user_id?: string | null;
  codename_alias?: string | null;
  full_name?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  contact_email?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  skills?: string[] | null;
  timezone?: string | null;
  country?: string | null;
  job_title?: string | null;
  headline?: string | null;
  bio?: string | null;
  experience_level?: string | null;
  major?: string | null;
  degree?: string | null;
  school?: string | null;
  university?: string | null;
  gpa?: string | number | null;
  graduation_year?: number | string | null;
  portfolio_url?: string | null;
  youtube_url?: string | null;
  availability_status?: string | null;
  availability?: string | null;
  work_preference?: string | null;
  role?: string | null;
};

export type ApplicantReviewStatus = "new" | "intro_requested" | "rejected";

export const APPLICANT_PIPELINE_STATUSES: Array<{
  value: ApplicantReviewStatus;
  label: string;
}> = [
  { value: "new", label: "New interest" },
  { value: "intro_requested", label: "Intro requested" },
  { value: "rejected", label: "Rejected" },
];

export type EmployerApplicantView = {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  jobStatus: string;
  profileId: string;
  candidateId: string;
  codenameAlias: string;
  initials: string;
  location: string;
  headline: string;
  experienceLevel: string;
  skills: string[];
  university: string;
  major: string;
  gpa: string;
  graduationYear: string;
  matchScore: number;
  fitVerdict: FitVerdict;
  matchingSkills: string[];
  missingSkills: string[];
  matchReasoning: string;
  appliedAt: string;
  appliedAtLabel: string;
  status: ApplicantReviewStatus;
  unlocked: boolean;
  verifiedOnProvix: boolean;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
};

export type EmployerApplicantsPayload = {
  applicants: EmployerApplicantView[];
  jobs: Array<{ id: string; title: string; status: string }>;
};

export function formatApplicantAppliedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function resolveApplicantContactEmail(
  profile: ApplicantProfileRow | null
): string | null {
  const contactEmail = profile?.contact_email?.trim();
  if (contactEmail) {
    return contactEmail;
  }

  const email = profile?.email?.trim();
  return email || null;
}

export function resolveApplicantProfileRow(
  profiles: ApplicantProfileRow | ApplicantProfileRow[] | null | undefined
): ApplicantProfileRow | null {
  if (!profiles) {
    return null;
  }
  return Array.isArray(profiles) ? profiles[0] ?? null : profiles;
}

export function resolveApplicantMatch(
  cached: MatchResult | number | null | undefined,
  candidate: { skills: string[]; headline: string; bio?: string | null },
  job: {
    title: string;
    techStack?: string[] | string | null;
    requiredSkills?: string[] | string | null;
    tags?: string[] | string | null;
  }
): MatchResult {
  const heuristic = scoreTalentMatch(
    {
      title: candidate.headline,
      skills: candidate.skills,
      bio: candidate.bio ?? "",
    },
    {
      title: job.title,
      techStack: job.techStack ?? undefined,
      requiredSkills: job.requiredSkills ?? undefined,
      tags: job.tags ?? undefined,
    }
  );

  if (typeof cached === "number" && Number.isFinite(cached) && !isCannedMatchScore(cached)) {
    return {
      ...heuristic,
      match_percentage: clampScore0to100(cached),
    };
  }

  if (cached && typeof cached === "object") {
    const score = clampScore0to100(cached.match_percentage);
    if (Number.isFinite(score) && !isCannedMatchScore(score)) {
      return {
        match_percentage: score,
        reasoning: cached.reasoning?.trim() || heuristic.reasoning,
        matching_skills:
          cached.matching_skills.length > 0
            ? cached.matching_skills
            : heuristic.matching_skills,
        missing_skills:
          cached.missing_skills.length > 0
            ? cached.missing_skills
            : heuristic.missing_skills,
      };
    }
  }

  return heuristic;
}

export function applicantReviewStatus(options: {
  reviewStatus?: string | null;
  introRequested: boolean;
}): ApplicantReviewStatus {
  const stored = options.reviewStatus?.trim().toLowerCase();
  if (stored === "rejected") {
    return "rejected";
  }
  if (stored === "intro_requested" || options.introRequested) {
    return "intro_requested";
  }
  return "new";
}

export function applicantStatusLabel(status: ApplicantReviewStatus): string {
  switch (status) {
    case "rejected":
      return "Rejected";
    case "intro_requested":
      return "Intro requested";
    default:
      return "New interest";
  }
}

export function applicantStatusClass(status: ApplicantReviewStatus): string {
  switch (status) {
    case "rejected":
      return "bg-rose-500/10 text-rose-300 border-rose-500/20";
    case "intro_requested":
      return "bg-indigo-500/10 text-indigo-300 border-indigo-500/20";
    default:
      return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  }
}

export { getFitVerdictBadgeClass };

export function mapEmployerApplicant(input: {
  applicationId: string;
  candidateId: string;
  createdAt: string;
  unlocked?: boolean | null;
  profile: ApplicantProfileRow | null;
  job: {
    id: string;
    title: string;
    status?: string | null;
    techStack?: string[] | string | null;
    requiredSkills?: string[] | string | null;
    tags?: string[] | string | null;
  };
  cachedMatch?: MatchResult | number | null;
  introRequested?: boolean;
  reviewStatus?: string | null;
}): EmployerApplicantView {
  const profile = input.profile;
  const profileId =
    resolvedProfileId(
      profile as Record<string, unknown> | null,
      input.candidateId
    ) ?? input.candidateId;
  const isUnlocked = Boolean(input.unlocked);
  const maskedAlias = generateMaskedAliasFromUuid(profileId);
  const education = educationFromProfileRow(
    profile as Record<string, unknown> | null
  );
  const skills = Array.isArray(profile?.skills) ? profile.skills : [];
  const headline =
    profile?.headline?.trim() ||
    profile?.job_title?.trim() ||
    "Open Role Candidate";
  const match = resolveApplicantMatch(
    input.cachedMatch,
    { skills, headline, bio: profile?.bio },
    {
      title: input.job.title,
      techStack: input.job.techStack,
      requiredSkills: input.job.requiredSkills,
      tags: input.job.tags,
    }
  );
  const matchScore = clampScore0to100(match.match_percentage);

  return {
    applicationId: input.applicationId,
    jobId: input.job.id,
    jobTitle: input.job.title.trim() || "Open Role",
    jobStatus: input.job.status === "paused" ? "Paused" : "Active",
    profileId,
    candidateId: input.candidateId,
    codenameAlias: maskedAlias,
    initials: getCodenameInitials(maskedAlias),
    location: getPublicCandidateLocation({
      country: profile?.country,
      timezone: profile?.timezone,
    }),
    headline,
    experienceLevel: profile?.experience_level?.trim() || "",
    skills,
    university: education.university,
    major: education.major,
    gpa: education.gpa,
    graduationYear: education.graduationYear,
    matchScore,
    fitVerdict: scoreToFitVerdict(matchScore),
    matchingSkills: match.matching_skills.slice(0, 4),
    missingSkills: match.missing_skills.slice(0, 4),
    matchReasoning: match.reasoning,
    appliedAt: input.createdAt,
    appliedAtLabel: formatApplicantAppliedAt(input.createdAt),
    status: applicantReviewStatus({
      reviewStatus: input.reviewStatus,
      introRequested: Boolean(input.introRequested),
    }),
    unlocked: isUnlocked,
    verifiedOnProvix: isVerifiedOnProvix(profile),
    email: isUnlocked ? resolveApplicantContactEmail(profile) : null,
    phone: isUnlocked ? profile?.phone?.trim() || null : null,
    linkedinUrl: isUnlocked ? profile?.linkedin_url?.trim() || null : null,
  };
}
