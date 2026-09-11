import type { GitHubAuditContext } from "@/lib/github-audit";
import { readJsonResponse } from "@/lib/read-json-response";
import { normalizeStringArray } from "@/lib/match-heuristic";
import { clampScore0to100 } from "@/lib/score-scale";

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
  switch (verdict) {
    case "Strong Fit":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
    case "Moderate Fit":
      return "bg-indigo-500/10 text-indigo-400 border-indigo-500/25";
    case "Growth Fit":
      return "bg-amber-500/10 text-amber-400 border-amber-500/25";
  }
}

function uniqueJobRequirements(job: OpportunityMatchJobPayload): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of [
    ...normalizeStringArray(job.techStack ?? job.tech_stack),
    ...normalizeStringArray(job.requiredSkills ?? job.required_skills),
    ...normalizeStringArray(job.tags),
  ]) {
    const key = item.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

export function buildFallbackOpportunityMatch(
  candidate: OpportunityMatchCandidatePayload,
  job: OpportunityMatchJobPayload,
  githubAudit?: GitHubAuditContext | null
): OpportunityMatchResult {
  const candidateSkills = normalizeStringArray(candidate.skills);
  const jobTags = uniqueJobRequirements(job);
  const roleType = candidate.role_type?.trim() ?? "";

  const normalizedCandidateSkills = candidateSkills.map((skill) =>
    skill.toLowerCase()
  );

  const matchingTags = jobTags.filter((tag) =>
    normalizedCandidateSkills.some(
      (skill) =>
        skill.includes(tag.toLowerCase()) || tag.toLowerCase().includes(skill)
    )
  );

  let match_score = 0;
  const match_reasons: string[] = [];

  if (matchingTags.length > 0) {
    match_score += Math.min(40, matchingTags.length * 12);
    match_reasons.push(
      `Your ${matchingTags.slice(0, 3).join(", ")} experience overlaps with this role's stack.`
    );
  }

  const missingTags = jobTags.filter(
    (tag) =>
      !matchingTags.some(
        (match) =>
          match.toLowerCase() === tag.toLowerCase() ||
          match.toLowerCase().includes(tag.toLowerCase()) ||
          tag.toLowerCase().includes(match.toLowerCase())
      )
  );

  if (missingTags.length > 0) {
    match_reasons.push(
      `This listing also asks for ${missingTags.slice(0, 3).join(", ")}, which are not on your profile yet.`
    );
  }

  if (roleType && job.title) {
    const titleLower = job.title.toLowerCase();
    const roleLower = roleType.toLowerCase();
    if (titleLower.includes(roleLower) || roleLower.includes(titleLower)) {
      match_score += 20;
      match_reasons.push(
        `Your ${roleType} focus aligns with the ${job.title} track.`
      );
    }
  }

  if (candidate.bio?.trim()) {
    match_score += 15;
  }

  if (githubAudit) {
    if (githubAudit.language && matchingTags.some((tag) =>
      tag.toLowerCase().includes(githubAudit.language!.toLowerCase())
    )) {
      match_score += 15;
      match_reasons.push(
        `GitHub audit shows active ${githubAudit.language} work in ${githubAudit.owner}/${githubAudit.repo}.`
      );
    } else if (githubAudit.commit_count_sampled >= 3) {
      match_score += 10;
      match_reasons.push(
        `GitHub shows ${githubAudit.commit_count_sampled} recent commits on ${githubAudit.owner}/${githubAudit.repo}.`
      );
    } else if (githubAudit.language) {
      match_reasons.push(
        `Your GitHub repo ${githubAudit.owner}/${githubAudit.repo} is primarily ${githubAudit.language}.`
      );
    } else if (githubAudit.commit_count_sampled <= 1) {
      match_score -= 8;
      match_reasons.push(
        `Limited commit history on ${githubAudit.owner}/${githubAudit.repo} — more activity would raise match confidence.`
      );
    }
  } else if (candidate.github_url?.trim() && match_reasons.length < 3) {
    match_reasons.push(
      "Add a public GitHub repo to your profile so matching can cite verified commits and languages."
    );
  }

  if (match_reasons.length < 2 && candidateSkills.length > 0) {
    match_reasons.push(
      `Your profile highlights ${candidateSkills.slice(0, 3).join(", ")} against ${job.title?.trim() || "this role"}.`
    );
  } else if (match_reasons.length < 2) {
    match_reasons.push(
      "Add skills or a GitHub repo to your profile so this role can be scored against your work."
    );
  }

  const clampedScore = clampMatchScore(match_score);

  return {
    match_score: clampedScore,
    fit_verdict: scoreToFitVerdict(clampedScore),
    match_reasons: normalizeMatchReasons(match_reasons),
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
