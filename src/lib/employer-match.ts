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

const BIO_JUNK_PATTERNS = [
  /^(n\/?a|none|nil|null|test|asdf|lorem|ipsum|placeholder|todo|tbd)\b/i,
  /^(hi|hello|hey)[\s,.!]*$/i,
  /^(looking for|open to|seeking)\s+(work|opportunities?|roles?)[\s.]*$/i,
];

export type BioQuality = {
  substantive: boolean;
  /** severe = empty/placeholder (drawer shows amber + single executive line). */
  severity: "none" | "mild" | "severe";
  penalty: number;
  flag: string | null;
};

/** Empty, tiny, or placeholder bios drag down role fit and get flagged. */
export function assessBioQuality(bio: string | undefined | null): BioQuality {
  const text = (bio ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return {
      substantive: false,
      severity: "severe",
      penalty: 18,
      flag: "Empty bio",
    };
  }
  if (text.length < 40 || BIO_JUNK_PATTERNS.some((re) => re.test(text))) {
    return {
      substantive: false,
      severity: "severe",
      penalty: 12,
      flag: "Placeholder or thin bio",
    };
  }
  // Very short "real" bios still under-inform JD fit.
  if (text.length < 80) {
    return {
      substantive: false,
      severity: "mild",
      penalty: 6,
      flag: "Short bio",
    };
  }
  return { substantive: true, severity: "none", penalty: 0, flag: null };
}

function tokenizeForFit(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#]+/g)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length >= 3);
}

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

/**
 * Profile narrative + experience vs full job description (not tags alone).
 * Returns 0–100.
 */
export function scoreProfileAgainstJobDescription(
  candidate: EmployerMatchCandidatePayload,
  job: MatchJobPayload
): number {
  const profileText = [
    candidate.title ?? "",
    candidate.bio ?? "",
    candidate.degree ?? "",
    resolveExperienceLevel(candidate),
    normalizeStringArray(candidate.skills).join(" "),
  ]
    .join(" ")
    .trim();

  const jobText = [
    job.title ?? "",
    job.company ?? "",
    job.location ?? "",
    job.description ?? "",
    job.searchQuery ?? "",
    ...normalizeStringArray(job.techStack ?? job.tech_stack),
    ...normalizeStringArray(job.requiredSkills ?? job.required_skills),
    ...normalizeStringArray(job.tags),
  ]
    .join(" ")
    .trim();

  if (!jobText || !profileText) {
    return 0;
  }

  const profileTokens = [...new Set(tokenizeForFit(profileText))];
  const jobTokens = [...new Set(tokenizeForFit(jobText))];
  if (jobTokens.length === 0 || profileTokens.length === 0) {
    return 0;
  }

  // Prefer JD description substance: weight longer description tokens.
  const descriptionTokens = [
    ...new Set(tokenizeForFit(job.description ?? "")),
  ];
  const primaryPool =
    descriptionTokens.length >= 8 ? descriptionTokens : jobTokens;

  let hits = 0;
  for (const req of primaryPool) {
    if (
      profileTokens.some(
        (tok) =>
          tok === req ||
          (tok.length >= 4 &&
            req.length >= 4 &&
            (tok.includes(req) || req.includes(tok)))
      )
    ) {
      hits += 1;
    }
  }

  const overlap = hits / primaryPool.length;
  // Bio length signal: substantive bios unlock the upper band of this pillar.
  const bioLen = (candidate.bio ?? "").trim().length;
  const narrativeBoost = bioLen >= 120 ? 8 : bioLen >= 80 ? 4 : 0;
  return clampMatchPercentage(Math.round(overlap * 92) + narrativeBoost);
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
 * Skill overlap + profile/bio vs full JD + experience bump + bounded audit bonus
 * − bio substance penalty.
 */
export function buildDeterministicEmployerMatch(
  candidate: EmployerMatchCandidatePayload,
  job: MatchJobPayload
): MatchResult {
  const verifiedSkills = resolveEmployerMatchSkills(candidate);
  const experienceLevel = resolveExperienceLevel(candidate);
  const auditScore = resolveAuditScore(candidate);
  const bioQuality = assessBioQuality(candidate.bio);

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

  let skillScore = 0;
  if (requirementCount === 0) {
    // No explicit job stack — mirror candidate job-match conservative floor.
    skillScore = experienceLevel
      ? 35
      : verifiedSkills.length > 0
        ? 28
        : 20;
  } else {
    skillScore = Math.round(
      (base.matching_skills.length / requirementCount) * 80
    );
  }

  const profileJdScore = scoreProfileAgainstJobDescription(candidate, job);
  // Blend: stack proof still matters, but bio/background vs JD is first-class.
  let match_percentage = Math.round(skillScore * 0.5 + profileJdScore * 0.5);

  if (experienceLevel) {
    match_percentage += 8;
  }

  match_percentage += computeAuditScoreBonus(auditScore);
  match_percentage -= bioQuality.penalty;
  match_percentage = clampMatchPercentage(match_percentage);

  const roleLabel =
    job.title?.trim() ||
    (job.searchQuery?.trim() ? `"${job.searchQuery.trim()}"` : "this search");

  // One executive line. Severe bio flags use a single verdict — no skill/JD echo.
  // Do not append Flag text here; the drawer owns the amber callout.
  let reasoning: string;
  if (bioQuality.severity === "severe") {
    reasoning = `Candidate profile lacks verifiable background narrative against ${roleLabel} criteria.`;
  } else if (base.matching_skills.length > 0) {
    reasoning = `Verified overlap on ${base.matching_skills
      .slice(0, 3)
      .join(", ")} for ${roleLabel}.`;
    if (profileJdScore < 55) {
      reasoning +=
        " Profile narrative only partially aligns with the role criteria.";
    }
  } else if (requirementCount > 0) {
    reasoning = `Limited verified skill overlap with ${roleLabel}.`;
    if (profileJdScore < 30) {
      reasoning += " Profile narrative does not align with the role criteria.";
    }
  } else {
    reasoning =
      "No active job stack yet — score reflects profile depth and audit confidence.";
  }

  return {
    match_percentage,
    reasoning,
    matching_skills: base.matching_skills,
    missing_skills: base.missing_skills,
  };
}
