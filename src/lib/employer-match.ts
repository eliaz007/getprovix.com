import {
  computeAuditScoreBonus,
  extractAuditedSkills,
  parseAuditBreakdownSignals,
  summarizeGithubAudit,
} from "@/lib/job-match";
import {
  clampMatchPercentage,
  normalizeStringArray,
  scoreTalentMatch,
  type MatchCandidatePayload,
  type MatchJobPayload,
  type MatchResult,
} from "@/lib/match-heuristic";

export type EmployerMatchCandidatePayload = MatchCandidatePayload & {
  experience_level?: string;
  experienceLevel?: string;
  auditScore?: number | null;
  productionScore?: number | null;
  auditBreakdown?: unknown;
  githubAudit?: unknown;
  github_url?: string;
  githubUrl?: string;
};

function resolveExperienceLevel(
  candidate: EmployerMatchCandidatePayload
): string {
  return (
    candidate.experience_level?.trim() ||
    candidate.experienceLevel?.trim() ||
    ""
  );
}

function resolveAuditScore(
  candidate: EmployerMatchCandidatePayload
): number | null {
  for (const value of [candidate.auditScore, candidate.productionScore]) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.round(value);
    }
  }
  return null;
}

/** Verified profile skills plus technologies inferred from audit payloads. */
export function resolveEmployerMatchSkills(
  candidate: EmployerMatchCandidatePayload
): string[] {
  const fromAudit = extractAuditedSkills({
    skills: candidate.skills,
    githubAudit: candidate.githubAudit,
  });
  if (fromAudit.length > 0) {
    return fromAudit;
  }
  return normalizeStringArray(candidate.skills);
}

export type EmployerVerifiedMatchContext = {
  verifiedTechnologies: string[];
  experienceLevel: string;
  auditScore: number | null;
  github: ReturnType<typeof summarizeGithubAudit>;
  productionSignals: ReturnType<typeof parseAuditBreakdownSignals> & {
    hasCiSignal: boolean;
    hasTestSignal: boolean;
  };
};

export function buildEmployerVerifiedMatchContext(
  candidate: EmployerMatchCandidatePayload
): EmployerVerifiedMatchContext {
  const breakdown = parseAuditBreakdownSignals(candidate.auditBreakdown);
  const github = summarizeGithubAudit(candidate.githubAudit);
  const auditScore = resolveAuditScore(candidate);

  return {
    verifiedTechnologies: resolveEmployerMatchSkills(candidate),
    experienceLevel: resolveExperienceLevel(candidate),
    auditScore,
    github,
    productionSignals: {
      ...breakdown,
      hasCiSignal:
        (breakdown.ciCdScore !== null && breakdown.ciCdScore > 0) ||
        Boolean(github),
      hasTestSignal:
        breakdown.testDensity !== null && breakdown.testDensity > 0,
    },
  };
}

/**
 * Employer talent-pool match % — TypeScript only.
 * Technical overlap (from verified skills) + experience bump + bounded audit bonus.
 */
export function buildDeterministicEmployerMatch(
  candidate: EmployerMatchCandidatePayload,
  job: MatchJobPayload
): MatchResult {
  const verifiedSkills = resolveEmployerMatchSkills(candidate);
  const experienceLevel = resolveExperienceLevel(candidate);
  const auditScore = resolveAuditScore(candidate);

  const base = scoreTalentMatch(
    {
      title: candidate.title,
      bio: candidate.bio,
      skills: verifiedSkills,
      degree: candidate.degree,
    },
    job
  );

  const requirementCount =
    base.matching_skills.length + base.missing_skills.length;

  let match_percentage = 0;
  if (requirementCount === 0) {
    // No explicit job stack — mirror candidate job-match conservative floor.
    match_percentage = experienceLevel
      ? 35
      : verifiedSkills.length > 0
        ? 28
        : 20;
  } else {
    match_percentage = Math.round(
      (base.matching_skills.length / requirementCount) * 80
    );
  }

  if (experienceLevel) {
    match_percentage += 8;
  }

  match_percentage += computeAuditScoreBonus(auditScore);
  match_percentage = clampMatchPercentage(match_percentage);

  const roleLabel =
    job.title?.trim() ||
    (job.searchQuery?.trim() ? `"${job.searchQuery.trim()}"` : "this search");

  const reasoning =
    base.matching_skills.length > 0
      ? `Verified overlap on ${base.matching_skills.slice(0, 3).join(", ")} for ${roleLabel}.`
      : requirementCount > 0
        ? `Limited verified skill overlap with ${roleLabel} based on audited stack.`
        : "No active job stack yet — score reflects verified profile depth and audit confidence.";

  return {
    match_percentage,
    reasoning,
    matching_skills: base.matching_skills,
    missing_skills: base.missing_skills,
  };
}
