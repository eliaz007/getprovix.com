import type { GitHubAuditContext } from "@/lib/github-audit";
import { readJsonResponse } from "@/lib/read-json-response";
import { normalizeStringArray } from "@/lib/match-heuristic";
import { clampScore0to100 } from "@/lib/score-scale";
import { filterTechnicalRequirements } from "@/lib/technical-skill-requirements";

export type FitVerdict = "Strong Fit" | "Moderate Fit" | "Growth Fit";

export type OpportunityMatchCandidatePayload = {
  title?: string;
  bio?: string;
  skills?: string[] | string;
  role_type?: string;
  github_url?: string;
  experience_level?: string;
};

export type OpportunityMatchJobPayload = {
  title?: string;
  company?: string;
  tags?: string[] | string;
  tech_stack?: string[] | string;
  techStack?: string[] | string;
  required_skills?: string[] | string;
  requiredSkills?: string[] | string;
  location?: string;
  description?: string;
  salary_range?: string;
};

export type OpportunityMatchResult = {
  match_score: number;
  fit_verdict: FitVerdict;
  match_reasons: string[];
};

const FIT_VERDICTS: FitVerdict[] = [
  "Strong Fit",
  "Moderate Fit",
  "Growth Fit",
];

export function clampMatchScore(value: unknown): number {
  return clampScore0to100(value, 0);
}

export function scoreToFitVerdict(score: number): FitVerdict {
  if (score >= 75) {
    return "Strong Fit";
  }
  if (score >= 50) {
    return "Moderate Fit";
  }
  return "Growth Fit";
}

export function normalizeFitVerdict(value: unknown, score: number): FitVerdict {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (FIT_VERDICTS.includes(normalized as FitVerdict)) {
      return normalized as FitVerdict;
    }
  }

  return scoreToFitVerdict(score);
}

export function normalizeMatchReasons(value: unknown): string[] {
  return normalizeStringArray(value)
    .map((reason) => reason.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3);
}

const CANDIDATE_MATCH_SECTION =
  /^(Your Stack Edge|Verified Proof|Application Angle)\s*:\s*(.*)$/i;

/** Split "Your Stack Edge: …" into a labeled section for candidate UI. */
export function splitCandidateMatchReason(reason: string): {
  label: string | null;
  body: string;
} {
  const match = reason.trim().match(CANDIDATE_MATCH_SECTION);
  if (!match) {
    return { label: null, body: reason.trim() };
  }
  return {
    label: match[1],
    body: (match[2] ?? "").trim(),
  };
}

export function normalizeOpportunityMatchResult(
  raw: unknown
): OpportunityMatchResult {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const scoreSource =
    record.match_score ?? record.score ?? record.match_percentage;
  const match_score = clampMatchScore(scoreSource);
  const fit_verdict = normalizeFitVerdict(record.fit_verdict, match_score);

  return {
    match_score,
    fit_verdict,
    match_reasons: normalizeMatchReasons(
      record.match_reasons ?? record.reasons ?? record.matching_skills
    ),
  };
}

export function getFitVerdictBadgeClass(verdict: FitVerdict): string {
  const base =
    "inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-medium";

  switch (verdict) {
    case "Strong Fit":
      return `${base} bg-emerald-500/10 text-emerald-400 border border-emerald-500/25`;
    case "Moderate Fit":
      return `${base} bg-[#1A1A1E] text-zinc-300 border border-white/[0.08]`;
    case "Growth Fit":
      return `${base} bg-violet-500/10 text-violet-300 border border-violet-500/25`;
  }
}

function uniqueJobRequirements(job: OpportunityMatchJobPayload): string[] {
  return filterTechnicalRequirements([
    ...normalizeStringArray(job.techStack ?? job.tech_stack),
    ...normalizeStringArray(job.requiredSkills ?? job.required_skills),
    ...normalizeStringArray(job.tags),
  ]);
}

export function buildFallbackOpportunityMatch(
  candidate: OpportunityMatchCandidatePayload,
  job: OpportunityMatchJobPayload,
  githubAudit?: GitHubAuditContext | null
): OpportunityMatchResult {
  const candidateSkills = normalizeStringArray(candidate.skills);
  const jobTags = uniqueJobRequirements(job);
  const roleLabel = job.title?.trim() || "this role";

  const normalizedCandidateSkills = candidateSkills.map((skill) =>
    skill.toLowerCase()
  );

  const matchingTags = jobTags.filter((tag) =>
    normalizedCandidateSkills.some(
      (skill) =>
        skill.includes(tag.toLowerCase()) || tag.toLowerCase().includes(skill)
    )
  );

  const missingTags = jobTags.filter(
    (tag) =>
      !matchingTags.some(
        (match) =>
          match.toLowerCase() === tag.toLowerCase() ||
          match.toLowerCase().includes(tag.toLowerCase()) ||
          tag.toLowerCase().includes(match.toLowerCase())
      )
  );

  let match_score = 0;
  if (matchingTags.length > 0) {
    match_score += Math.min(45, matchingTags.length * 12);
  } else if (candidateSkills.length > 0) {
    match_score += 18;
  }

  if (candidate.bio?.trim()) {
    match_score += 10;
  }

  const repoLabel =
    githubAudit?.owner && githubAudit?.repo
      ? `${githubAudit.owner}/${githubAudit.repo}`
      : "your audited repo";

  if (githubAudit) {
    if (
      githubAudit.language &&
      matchingTags.some((tag) =>
        tag.toLowerCase().includes(githubAudit.language!.toLowerCase())
      )
    ) {
      match_score += 15;
    } else if (githubAudit.commit_count_sampled >= 3) {
      match_score += 10;
    }
  }

  const stackSkills =
    matchingTags.length > 0
      ? matchingTags.slice(0, 3)
      : candidateSkills.slice(0, 3);

  const stackEdge =
    matchingTags.length > 0
      ? `Your Stack Edge: Your verified ${stackSkills.join(", ")} overlap ${roleLabel}'s listed stack — lead with those exact technologies.`
      : stackSkills.length > 0
        ? `Your Stack Edge: Highlight your audited ${stackSkills.join(", ")} and map each to the closest requirement on ${roleLabel}.`
        : `Your Stack Edge: Add core languages/frameworks to your profile so this role can cite exact stack overlap.`;

  const verifiedProof = githubAudit
    ? githubAudit.commit_count_sampled >= 3
      ? `Verified Proof: ${githubAudit.commit_count_sampled} recent commits on ${repoLabel}${
          githubAudit.language ? ` (${githubAudit.language})` : ""
        } demonstrate shipping cadence most applicants cannot show.`
      : githubAudit.language
        ? `Verified Proof: Your GitHub work on ${repoLabel} is primarily ${githubAudit.language} — cite that as production evidence.`
        : `Verified Proof: Keep your Provix audit and GitHub activity current to prove production readiness.`
    : `Verified Proof: Connect a public repo and keep a 75+ audit so this application shows verified production proof.`;

  const applicationAngle =
    missingTags.length > 0
      ? `Application Angle: Address ${missingTags.slice(0, 2).join(" and ")} by pairing adjacent audited skills with a short repo walkthrough — and frame velocity on ${repoLabel} to offset generic tenure asks.`
      : `Application Angle: Lead with stack overlap and audit proof, then show a short walkthrough of your highest-signal project for ${roleLabel}.`;

  const clampedScore = clampMatchScore(match_score);

  return {
    match_score: clampedScore,
    fit_verdict: scoreToFitVerdict(clampedScore),
    match_reasons: normalizeMatchReasons([
      stackEdge,
      verifiedProof,
      applicationAngle,
    ]),
  };
}

export async function fetchOpportunityMatch(
  candidate: OpportunityMatchCandidatePayload,
  job: OpportunityMatchJobPayload
): Promise<OpportunityMatchResult> {
  try {
    const response = await fetch("/api/opportunities/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate, job }),
    });

    if (!response.ok) {
      return buildFallbackOpportunityMatch(candidate, job);
    }

    const raw = (await readJsonResponse(response)) as unknown;
    if (raw && typeof raw === "object" && "error" in (raw as object)) {
      return buildFallbackOpportunityMatch(candidate, job);
    }

    return normalizeOpportunityMatchResult(raw);
  } catch (error) {
    console.warn("Opportunity match API unavailable, using fallback.", error);
    return buildFallbackOpportunityMatch(candidate, job);
  }
}
