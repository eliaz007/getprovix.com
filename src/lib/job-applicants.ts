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
import { employerVisibleProductionAudit, parseProductionAuditFromProfileRow } from "@/lib/production-audit";
import { clampScore0to100 } from "@/lib/score-scale";
import { normalizeAvailabilityStatus } from "@/lib/availability-status";
import { DEFAULT_EXPERIENCE_LEVEL } from "@/lib/experience-level";
import {
  parseProofOfWorkProjects,
  resolveCandidateGithubUrl,
  type TalentPoolCandidate,
} from "@/lib/talent-pool-candidate";
import { formatGpa } from "@/lib/gpa";
import { educationFromProfileRow } from "@/lib/talent-pool-profiles";
import {
  DEFAULT_WORK_PREFERENCE,
  normalizeCandidateTimezone,
  normalizeWorkPreference,
} from "@/lib/work-preference";

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
  "education",
  "is_self_taught",
  "portfolio_url",
  "youtube_url",
  "availability_status",
  "availability",
  "work_preference",
  "role",
  "key_accomplishments",
  "integrity_score",
  "audit_data",
  "production_score",
  "audit_breakdown",
  "is_audit_verified",
  "is_publicly_visible",
  "verification_status",
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
  education?: unknown;
  is_self_taught?: boolean | string | number | null;
  portfolio_url?: string | null;
  youtube_url?: string | null;
  availability_status?: string | null;
  availability?: string | null;
  work_preference?: string | null;
  role?: string | null;
  key_accomplishments?: string | null;
  github_url?: string | null;
  integrity_score?: number | string | null;
  audit_data?: unknown;
  production_score?: number | string | null;
  audit_breakdown?: unknown;
  is_audit_verified?: boolean | null;
  is_publicly_visible?: boolean | null;
  verification_status?: string | null;
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
  isSelfTaught: boolean;
  matchScore: number;
  fitVerdict: FitVerdict;
  matchingSkills: string[];
  missingSkills: string[];
  matchReasoning: string;
  bio: string;
  githubUrl: string;
  github: string;
  demoVideo: string;
  projects: string[];
  availability: string;
  workPreference: string;
  timezone: string;
  country: string;
  appliedAt: string;
  appliedAtLabel: string;
  status: ApplicantReviewStatus;
  unlocked: boolean;
  verifiedOnProvix: boolean;
  productionScore?: number | null;
  auditBreakdown?: unknown;
  isAuditVerified?: boolean;
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
      return "bg-violet-500/10 text-violet-300 border-violet-500/20";
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
  const github = resolveCandidateGithubUrl({
    github_url: profile?.github_url,
    portfolio_url: profile?.portfolio_url,
  });
  const productionAudit = employerVisibleProductionAudit(
    parseProductionAuditFromProfileRow(profile)
  );

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
    gpa: formatGpa(education.gpa),
    graduationYear: education.graduationYear,
    isSelfTaught: Boolean(education.isSelfTaught),
    matchScore,
    fitVerdict: scoreToFitVerdict(matchScore),
    matchingSkills: match.matching_skills.slice(0, 4),
    missingSkills: match.missing_skills.slice(0, 4),
    matchReasoning: match.reasoning,
    bio: profile?.bio?.trim() || "",
    githubUrl: github.githubUrl,
    github: github.github,
    demoVideo: profile?.youtube_url?.trim() || "",
    projects: parseProofOfWorkProjects(profile?.key_accomplishments),
    availability: normalizeAvailabilityStatus(
      profile?.availability_status ?? profile?.availability
    ),
    workPreference: normalizeWorkPreference(profile?.work_preference),
    timezone: normalizeCandidateTimezone(profile?.timezone) || "",
    country: profile?.country?.trim() || "",
    appliedAt: input.createdAt,
    appliedAtLabel: formatApplicantAppliedAt(input.createdAt),
    status: applicantReviewStatus({
      reviewStatus: input.reviewStatus,
      introRequested: Boolean(input.introRequested),
    }),
    unlocked: isUnlocked,
    verifiedOnProvix: isVerifiedOnProvix(profile),
    productionScore: productionAudit?.productionScore ?? null,
    auditBreakdown: productionAudit?.breakdown ?? null,
    isAuditVerified: productionAudit?.isAuditVerified ?? false,
    email: isUnlocked ? resolveApplicantContactEmail(profile) : null,
    phone: isUnlocked ? profile?.phone?.trim() || null : null,
    linkedinUrl: isUnlocked ? profile?.linkedin_url?.trim() || null : null,
  };
}

export type ApplicantIntelligenceSource = {
  profileId: string;
  codenameAlias: string;
  headline: string;
  location: string;
  skills: string[];
  university: string;
  major: string;
  gpa: string;
  graduationYear: string;
  isSelfTaught?: boolean;
  verifiedOnProvix: boolean;
  productionScore?: number | null;
  auditBreakdown?: unknown;
  isAuditVerified?: boolean;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  jobTitle?: string;
  matchScore?: number;
  aiScoreLabel?: string;
  experienceLevel?: string;
  bio?: string;
  github?: string;
  githubUrl?: string;
  demoVideo?: string;
  projects?: string[];
  availability?: string;
  workPreference?: string;
  timezone?: string;
  country?: string;
};

export function mapApplicantToTalentCandidate(
  applicant: ApplicantIntelligenceSource
): TalentPoolCandidate {
  const roleTitle = applicant.jobTitle?.trim() || applicant.headline;
  const parsedScore =
    typeof applicant.matchScore === "number" && Number.isFinite(applicant.matchScore)
      ? applicant.matchScore
      : Number.parseInt(applicant.aiScoreLabel?.replace(/\D/g, "") ?? "", 10);
  const matchScore = Number.isFinite(parsedScore)
    ? parsedScore
    : scoreTalentMatch(
        { title: applicant.headline, skills: applicant.skills },
        { title: roleTitle }
      ).match_percentage;
  const codename = applicant.codenameAlias;
  const github = resolveCandidateGithubUrl({
    github_url: applicant.githubUrl,
    github: applicant.github,
  });

  return {
    id: `C-${applicant.profileId.replace(/-/g, "").slice(0, 3).toUpperCase()}`,
    profileId: applicant.profileId,
    name: codename,
    fullName: codename,
    profileName: codename,
    firstName: codename.split(/\s+/)[0] ?? codename,
    lastName: codename.split(/\s+/).slice(1).join(" "),
    headline: applicant.headline,
    codenameAlias: codename,
    country: applicant.country || applicant.location,
    timezone: applicant.timezone || applicant.location,
    workPreference: applicant.workPreference || DEFAULT_WORK_PREFERENCE,
    email: applicant.email ?? "",
    phone: applicant.phone ?? "",
    linkedin_url: applicant.linkedinUrl ?? "",
    github_url: github.githubUrl,
    role: applicant.headline,
    university: applicant.university,
    major: applicant.major,
    gpa: formatGpa(applicant.gpa),
    graduationYear: applicant.graduationYear,
    isSelfTaught: Boolean(applicant.isSelfTaught),
    skills: applicant.skills,
    rating: applicant.aiScoreLabel || `${matchScore}% Match`,
    execution_score: matchScore,
    matchScore,
    status: applicant.availability || "Available Now",
    experienceLevel: applicant.experienceLevel || DEFAULT_EXPERIENCE_LEVEL,
    roleType: "General",
    availability: applicant.availability || "Available Now",
    bio: applicant.bio || "Candidate expressed interest in this role via Provix.",
    github: github.github,
    demoVideo: applicant.demoVideo || "",
    projects: applicant.projects ?? [],
    verifiedOnProvix: applicant.verifiedOnProvix,
    productionScore: applicant.productionScore ?? null,
    auditBreakdown:
      parseProductionAuditFromProfileRow({
        production_score: applicant.productionScore,
        audit_breakdown: applicant.auditBreakdown,
        is_audit_verified: applicant.isAuditVerified,
      })?.breakdown ?? null,
    isAuditVerified: Boolean(applicant.isAuditVerified),
  };
}
