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
import type { ApplicantReviewStatus } from "./applicantreviewstatus";

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
  openToFulltime: boolean;
  openToContract: boolean;
  contractHoursPerWeek: string | null;
  contractHourlyRate: number | null;
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
