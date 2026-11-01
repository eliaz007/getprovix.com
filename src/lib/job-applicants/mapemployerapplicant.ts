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
import {
  normalizeContractHourlyRate,
  normalizeContractHoursPerWeek,
  normalizeOpenToContract,
  normalizeOpenToFulltime,
} from "@/lib/contract-availability";
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
import type { ApplicantProfileRow } from "./applicantprofilerow";
import type { EmployerApplicantView } from "./employerapplicantview";
import { formatApplicantAppliedAt } from "./formatapplicantappliedat";
import { resolveApplicantContactEmail } from "./resolveapplicantcontactemail";
import { resolveApplicantMatch } from "./resolveapplicantmatch";
import { applicantReviewStatus } from "./applicantreviewstatus-11";

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
    openToFulltime: normalizeOpenToFulltime(profile?.open_to_fulltime),
    openToContract: normalizeOpenToContract(profile?.open_to_contract),
    contractHoursPerWeek:
      normalizeContractHoursPerWeek(profile?.contract_hours_per_week) || null,
    contractHourlyRate: normalizeContractHourlyRate(
      profile?.contract_hourly_rate
    ),
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
