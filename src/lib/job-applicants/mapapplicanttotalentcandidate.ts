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
import type { ApplicantIntelligenceSource } from "./applicantintelligencesource";

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
    openToFulltime: normalizeOpenToFulltime(applicant.openToFulltime),
    openToContract: normalizeOpenToContract(applicant.openToContract),
    contractHoursPerWeek:
      normalizeContractHoursPerWeek(applicant.contractHoursPerWeek) || null,
    contractHourlyRate: normalizeContractHourlyRate(
      applicant.contractHourlyRate
    ),
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
