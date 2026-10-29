import { GoogleGenAI, Type } from "@google/genai";
import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/admin-access";
import { requireAiApiUser, rejectUnlessVerifiedEmployer } from "@/lib/api-auth";
import {
  hasUsableExternalProjects,
  normalizeExternalProjects,
  type ExternalProjectRecord,
} from "@/lib/external-projects";
import {
  emptyGitHubAuditContext,
  fetchGitHubAudit,
  githubAuditHasFetchedArtifacts,
  type GitHubAuditContext,
} from "@/lib/github-audit";
import { profileRowIsPublicToEmployers } from "@/lib/opportunities-metrics";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import {
  employerHasApplicantForProfile,
  fetchProfileForCandidateId,
  hydrateScreenCandidateFromProfile,
  isProfileUuid,
  resolvedProfileId,
} from "@/lib/resolve-candidate-profile";
import {
  deterministicMetricsPayload,
  finalizeExecutiveBrief,
  parseExecutiveBrief,
  type ExecutiveBrief,
} from "@/lib/executive-brief";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  applyFilesystemScoreCap,
  buildFilesystemScorePolicy,
  compactFilesystemForPrompt,
  emptyScoreCapAudit,
  parseScoreCapAudit,
  type ScoreCapAudit,
} from "@/lib/repo-filesystem";
import {
  applyUpstreamDerivativePenalty,
  computeProductionAuditMetrics,
  emptyProductionAuditMetrics,
  UPSTREAM_DERIVATIVE_PENALTY,
  UPSTREAM_DERIVATIVE_WARNING,
  type ProductionAuditMetrics,
} from "@/lib/production-audit-metrics";
import {
  CANONICAL_AUDIT_CHECKS,
  defaultAuditCheckSummary,
  normalizeAuditChecks,
  type AuditCheck,
} from "@/lib/audit-checks";
import { formatGpa } from "@/lib/gpa";
import {
  parseProductionAuditBreakdown,
  type ProductionAuditBreakdown,
} from "@/lib/production-audit";
import {
  completeScreeningRun,
  enqueuePendingScreening,
  failScreeningRun,
  markScreeningProcessing,
  readQueuedRunId,
  type ScreeningJobInput,
} from "@/lib/screening-queue";
import { createClient } from "@/utils/supabase/server";
import type { ScreeningMode } from "./screeningmode";
import type { CandidatePayload } from "./candidatepayload";
import type { JobPayload } from "./jobpayload";
import { screenRequestBodySchema } from "./screenrequestbodyschema";
import { asTrimmedString } from "./astrimmedstring";
import { isValidScreeningJobContext } from "./isvalidscreeningjobcontext";
import { resolveScreeningMode } from "./resolvescreeningmode";
import type { InterviewQuestion } from "./interviewquestion";
import type { ScreenResult } from "./screenresult";
import { buildSystemPrompt } from "./buildsystemprompt";
import { SCREEN_RESPONSE_SCHEMA } from "./screen-response-schema";
import { MODEL_CANDIDATES } from "./model-candidates";
import { INTERVIEW_QUESTION_COUNT } from "./interview-question-count";
import { isGeminiUnavailableError } from "./isgeminiunavailableerror";
import { sleep } from "./sleep";
import { HANDLE_MISMATCH_PATTERN } from "./handle-mismatch-pattern";

export function isGithubHandleDisplayNameFlag(flag: string): boolean {
  const text = flag.trim();
  if (!text) {
    return false;
  }

  const mentionsGithubIdentity =
    /\b(github\s+)?(handle|username|user\s*name|login)\b/i.test(text) ||
    /\bgithub\.com\//i.test(text);
  const mentionsDisplayIdentity =
    /\b(display\s+name|candidate(?:'s)?\s+name|profile\s+name|codename|alias)\b/i.test(
      text
    ) || /\bname\b/i.test(text);

  return (
    mentionsGithubIdentity &&
    mentionsDisplayIdentity &&
    HANDLE_MISMATCH_PATTERN.test(text)
  );
}

function isMissingResumeFlag(flag: string): boolean {
  const value = flag.trim();
  if (!value) {
    return false;
  }

  return (
    /no resume|missing resume|without (a )?resume|lack of (a )?resume/i.test(
      value
    ) ||
    /(resume|cv|experience summary).{0,24}(not (provided|uploaded|included|submitted|attached)|is missing|was missing)/i.test(
      value
    ) ||
    /resume or experience summary/i.test(value)
  );
}

function stripGithubHandleDisplayNameFlags(flags: string[]): {
  flags: string[];
  stripped: number;
} {
  const kept = flags.filter(
    (flag) => !isGithubHandleDisplayNameFlag(flag) && !isMissingResumeFlag(flag)
  );
  return { flags: kept, stripped: flags.length - kept.length };
}

function stripHandleMismatchFromProse(text: string, fallback: string): string {
  const sentences = text
    .split(/[.!?]+\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const kept = sentences.filter(
    (sentence) => !isGithubHandleDisplayNameFlag(sentence)
  );

  if (kept.length === 0) {
    return isGithubHandleDisplayNameFlag(text) ? fallback : text;
  }

  return kept
    .map((sentence) =>
      /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
    )
    .join(" ");
}

function normalizeStringArray(value: unknown, maxItems: number): string[] {
  if (typeof value === "string") {
    return value
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, maxItems);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function metricsFromAuditBreakdown(
  breakdown: ProductionAuditBreakdown,
  isUpstreamDerivative: boolean
): ProductionAuditMetrics {
  const architecture = clampScore0to100(breakdown.architecture_score);
  const testing = clampScore0to100(breakdown.test_density);
  const devops = clampScore0to100(breakdown.ci_cd_score);
  const resilience = clampScore0to100(breakdown.error_handling);
  let productionScore = clampScore0to100(
    Math.round(
      architecture * 0.35 + testing * 0.25 + devops * 0.2 + resilience * 0.2
    )
  );
  let upstreamDerivativePenalty = 0;
  if (isUpstreamDerivative) {
    productionScore = applyUpstreamDerivativePenalty(productionScore, true);
    upstreamDerivativePenalty = UPSTREAM_DERIVATIVE_PENALTY;
  }

  const empty = emptyProductionAuditMetrics();
  return {
    ...empty,
    architecture,
    testing,
    devops,
    resilience,
    productionScore,
    codeHealthScore: productionScore,
    deliveryHygieneScore: empty.deliveryHygieneScore ?? 100,
    upstreamDerivativePenalty,
    ciCdHealth: devops,
    testAssertionDensity: testing,
    errorBoundaries: resilience,
    evidence: {
      ...empty.evidence,
      inspected: true,
    },
  };
}

function finalizeScreenWithBreakdown(
  result: ScreenResult,
  auditBreakdown: ProductionAuditBreakdown | null,
  githubAudit: GitHubAuditContext | null
): ScreenResult {
  if (!auditBreakdown || result.metrics.evidence.inspected) {
    return result;
  }

  const isUpstreamDerivative = githubAudit?.is_upstream_derivative === true;
  const metrics = metricsFromAuditBreakdown(
    auditBreakdown,
    isUpstreamDerivative
  );
  let timeline_flags = result.timeline_flags;
  if (
    isUpstreamDerivative &&
    !timeline_flags.includes(UPSTREAM_DERIVATIVE_WARNING)
  ) {
    timeline_flags = [...timeline_flags, UPSTREAM_DERIVATIVE_WARNING];
  }

  const executiveBrief = finalizeExecutiveBrief({
    draft: result.executiveBrief,
    productionScore: metrics.productionScore,
    architectureScore: metrics.architecture,
    testScore: metrics.testing,
    devopsScore: metrics.devops,
    resilienceScore: metrics.resilience,
    isUpstreamDerivative,
    auditMode: "contract",
    // Keep Gemini hiring verdict when valid; repo metrics are technical proof only.
    preferModelRoleBand: true,
  });

  return {
    ...result,
    integrity_score: metrics.productionScore,
    timeline_flags,
    metrics,
    executiveBrief,
    github_audit: result.github_audit
      ? { ...result.github_audit, executiveBrief }
      : githubAudit
        ? { ...githubAudit, executiveBrief }
        : null,
  };
}

function applyScreenFilesystemCap(
  result: Omit<ScreenResult, "metrics"> & {
    metrics?: ProductionAuditMetrics | null;
  },
  githubAudit: GitHubAuditContext | null
): ScreenResult {
  const capped = applyFilesystemScoreCap(
    {
      score: result.integrity_score,
      redFlags: result.timeline_flags,
    },
    githubAudit?.filesystem,
    8
  );

  let metrics = computeProductionAuditMetrics(
    githubAudit?.filesystem,
    undefined,
    githubAudit?.commit_history_fetched
      ? {
          commitDates: githubAudit.commit_dates,
          commitStats: githubAudit.commit_stats,
        }
      : null
  );
  let integrity_score = capped.score;
  let timeline_flags = capped.redFlags;
  let scoreCap = capped.scoreCap;

  if (metrics.evidence.inspected) {
    integrity_score = metrics.productionScore;
    const reCapped = applyFilesystemScoreCap(
      {
        score: integrity_score,
        redFlags: timeline_flags,
      },
      githubAudit?.filesystem,
      8
    );
    integrity_score = reCapped.score;
    timeline_flags = reCapped.redFlags;
    scoreCap = reCapped.scoreCap;
  }

  if (githubAudit?.is_upstream_derivative) {
    if (metrics.evidence.inspected) {
      integrity_score = applyUpstreamDerivativePenalty(integrity_score, true);
      metrics = {
        ...metrics,
        productionScore: integrity_score,
        upstreamDerivativePenalty: UPSTREAM_DERIVATIVE_PENALTY,
      };
    } else {
      integrity_score = applyUpstreamDerivativePenalty(integrity_score, true);
    }
    if (!timeline_flags.includes(UPSTREAM_DERIVATIVE_WARNING)) {
      timeline_flags = [...timeline_flags, UPSTREAM_DERIVATIVE_WARNING];
    }
  }

  const isUpstreamDerivative = githubAudit?.is_upstream_derivative === true;
  const executiveBrief = finalizeExecutiveBrief({
    draft: result.executiveBrief,
    productionScore: metrics.evidence.inspected
      ? metrics.productionScore
      : integrity_score,
    architectureScore: metrics.architecture,
    testScore: metrics.testing,
    devopsScore: metrics.devops,
    resilienceScore: metrics.resilience,
    isUpstreamDerivative,
    auditMode: "contract",
    // Keep Gemini hiring verdict when valid; repo metrics are technical proof only.
    preferModelRoleBand: true,
  });
  const github_audit = result.github_audit
    ? { ...result.github_audit, executiveBrief }
    : githubAudit
      ? { ...githubAudit, executiveBrief }
      : null;

  return {
    ...result,
    integrity_score,
    timeline_flags,
    scoreCap,
    metrics,
    executiveBrief,
    github_audit,
  };
}

function clampIntegrityScore(value: unknown): number {
  return clampScore0to100(value, 0);
}

function normalizeInterviewQuestions(value: unknown): InterviewQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const questions: InterviewQuestion[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const question =
      typeof record.question === "string" ? record.question.trim() : "";
    const category =
      typeof record.category === "string" ? record.category.trim() : "";
    const what_to_listen_for =
      typeof record.what_to_listen_for === "string"
        ? record.what_to_listen_for.trim()
        : "";

    if (question && category && what_to_listen_for) {
      questions.push({ question, category, what_to_listen_for });
    }
  }

  return questions.slice(0, INTERVIEW_QUESTION_COUNT);
}

function buildDefaultInterviewQuestions(
  candidate: CandidatePayload,
  job: JobPayload,
  mode: ScreeningMode
): InterviewQuestion[] {
  const roleLabel = job.title ?? candidate.title ?? "this role";
  const topSkill =
    normalizeStringArray(candidate.skills, 1)[0] ?? "your primary stack";

  if (mode === "baseline") {
    return [
      {
        question: `Walk through the highest-risk module in your audited codebase and how you would redesign its boundaries using ${topSkill}.`,
        category: "Code Design",
        what_to_listen_for:
          "Strong answers name concrete modules, coupling risks, and a migration path. Weak answers stay abstract or ignore trade-offs.",
      },
      {
        question:
          "Where would you add tests or CI gates first to harden this repository, and what failure modes would those catch?",
        category: "Code Design",
        what_to_listen_for:
          "Strong answers prioritize based on blast radius and cite real gaps. Weak answers recite generic testing slogans.",
      },
    ];
  }

  return [
    {
      question: `Walk me through how you would apply ${topSkill} to the core requirements of the ${roleLabel} role. What trade-offs would you make?`,
      category: "Architecture / Process",
      what_to_listen_for:
        "Strong answers map stack choices to this role's constraints. Weak answers stay generic with no role grounding.",
    },
    {
      question: `Which ${roleLabel} requirements are not yet proven in your audited artifacts, and how would you demonstrate them in the first 30 days?`,
      category: "Technical Depth",
      what_to_listen_for:
        "Strong answers own stack gaps and propose concrete proof. Weak answers deny gaps or cannot cite evidence.",
    },
  ];
}

function normalizeScreenResult(
  raw: unknown,
  candidate: CandidatePayload,
  job: JobPayload,
  mode: ScreeningMode
): ScreenResult {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const { flags: timeline_flags, stripped: strippedHandleFlags } =
    stripGithubHandleDisplayNameFlags(
      normalizeStringArray(record.timeline_flags, 8)
    );

  const artifactFallback =
    "Insufficient artifact data to fully validate proof-of-work claims.";
  const depthFallback =
    "Technical depth appears partially aligned with stated skills.";

  const rawChecks =
    Array.isArray(record.checks) && record.checks.length > 0
      ? record.checks
      : [
          {
            id: "artifact_analysis",
            title: CANONICAL_AUDIT_CHECKS[0].title,
            summary:
              typeof record.artifact_analysis === "string"
                ? record.artifact_analysis
                : artifactFallback,
          },
        ];

  const checks = normalizeAuditChecks(rawChecks).map((check) => ({
    ...check,
    summary: stripHandleMismatchFromProse(
      check.summary,
      defaultAuditCheckSummary(check.id)
    ),
  }));

  const artifact_analysis = checks[0]?.summary || artifactFallback;

  const technical_depth_summary = stripHandleMismatchFromProse(
    typeof record.technical_depth_summary === "string" &&
      record.technical_depth_summary.trim()
      ? record.technical_depth_summary.trim()
      : depthFallback,
    depthFallback
  );

  const interview_questions = normalizeInterviewQuestions(
    record.interview_questions
  );
  while (interview_questions.length < INTERVIEW_QUESTION_COUNT) {
    const defaults = buildDefaultInterviewQuestions(candidate, job, mode);
    interview_questions.push(defaults[interview_questions.length]);
  }

  const restoredScore =
    strippedHandleFlags > 0
      ? clampIntegrityScore(
          clampIntegrityScore(record.integrity_score) +
            Math.min(12, strippedHandleFlags * 6)
        )
      : clampIntegrityScore(record.integrity_score);

  return {
    integrity_score: restoredScore,
    timeline_flags,
    artifact_analysis,
    technical_depth_summary,
    interview_questions: interview_questions.slice(0, INTERVIEW_QUESTION_COUNT),
    checks,
    scoreCap:
      parseScoreCapAudit(record.scoreCap) ?? emptyScoreCapAudit(restoredScore),
    metrics: emptyProductionAuditMetrics(),
    executiveBrief: parseExecutiveBrief(record.executiveBrief),
  };
}

function resolveCandidateGitHubUrl(candidate: CandidatePayload): string | null {
  const candidates = [candidate.github_url, candidate.github]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const url of candidates) {
    if (url.toLowerCase().includes("github.com")) {
      return url.startsWith("http") ? url : `https://${url}`;
    }
  }

  return null;
}

function buildFallbackScreen(
  candidate: CandidatePayload,
  job: JobPayload,
  githubAudit: GitHubAuditContext | null,
  mode: ScreeningMode,
  auditBreakdown: ProductionAuditBreakdown | null
): ScreenResult {
  const skills = normalizeStringArray(candidate.skills, 8);
  const jobTags = [
    ...normalizeStringArray(job.techStack ?? job.tech_stack, 8),
    ...normalizeStringArray(job.requiredSkills ?? job.required_skills, 8),
    ...normalizeStringArray(job.tags, 8),
  ];
  const overlap = jobTags.filter((tag: (typeof jobTags)[number]) =>
    skills.some(
      (skill) =>
        skill.toLowerCase().includes(tag.toLowerCase()) ||
        tag.toLowerCase().includes(skill.toLowerCase())
    )
  );

  const timeline_flags: string[] = [];
  let integrity_score =
    mode === "job_aware" ? overlap.length * 12 : skills.length > 0 ? 24 : 12;

  if (auditBreakdown) {
    integrity_score = clampIntegrityScore(
      Math.round(
        auditBreakdown.architecture_score * 0.35 +
          auditBreakdown.test_density * 0.25 +
          auditBreakdown.ci_cd_score * 0.2 +
          auditBreakdown.error_handling * 0.2
      )
    );
    if (auditBreakdown.test_density < 40) {
      timeline_flags.push(
        mode === "job_aware"
          ? "Unverified stack gap: test density in stored audit_breakdown is too low to prove role readiness."
          : "Technical blind spot: stored audit_breakdown shows weak test density."
      );
    }
    if (auditBreakdown.ci_cd_score < 40) {
      timeline_flags.push(
        mode === "job_aware"
          ? "Unverified stack gap: CI/CD signals in audit_breakdown do not support production ownership for this role."
          : "Technical blind spot: CI/CD depth is thin in stored audit_breakdown."
      );
    }
  }

  if (githubAudit) {
    if (!auditBreakdown) {
      integrity_score += Math.min(25, githubAudit.commit_count_sampled * 5);
    }

    if (githubAudit.commit_count_sampled <= 1) {
      timeline_flags.push(
        "Repository shows minimal commit history relative to claimed project ownership."
      );
    }

    if (githubAudit.readme_excerpt) {
      if (!auditBreakdown) {
        integrity_score += 15;
      }
    } else {
      timeline_flags.push(
        "No README found — limited evidence of documented architecture or setup."
      );
      if (!auditBreakdown) {
        integrity_score -= 8;
      }
    }

    if (githubAudit.fetch_warnings.length > 0) {
      timeline_flags.push(...githubAudit.fetch_warnings.slice(0, 2));
    }
  } else if (!auditBreakdown) {
    timeline_flags.push(
      "No auditable GitHub repository URL was provided for live artifact verification."
    );
  }

  const roleLabel = job.title ?? "this role";
  const artifact_analysis = auditBreakdown
    ? `Stored audit_breakdown for ${auditBreakdown.audited_repo_url || "audited repo"}: architecture ${auditBreakdown.architecture_score}, CI/CD ${auditBreakdown.ci_cd_score}, tests ${auditBreakdown.test_density}, resilience ${auditBreakdown.error_handling}.`
    : githubAudit
      ? `Fallback audit of ${githubAudit.owner}/${githubAudit.repo}: ${githubAudit.commit_count_sampled} recent commits sampled, primary language ${githubAudit.language ?? "unknown"}.`
      : "Fallback screening could not verify proof-of-work artifacts against a public GitHub repository.";

  const technical_depth_summary =
    mode === "job_aware"
      ? `Role-specific match proof for ${roleLabel}: ${
          overlap.join(", ") ||
          skills.slice(0, 2).join(", ") ||
          "limited explicit stack matches"
        }.`
      : `General architectural strengths: ${
          auditBreakdown
            ? `architecture ${auditBreakdown.architecture_score}/100 with CI ${auditBreakdown.ci_cd_score}/100`
            : skills.slice(0, 3).join(", ") || "limited audited evidence"
        }.`;

  return finalizeScreenWithBreakdown(
    applyScreenFilesystemCap(
      {
        integrity_score: clampIntegrityScore(integrity_score),
        timeline_flags,
        artifact_analysis,
        technical_depth_summary,
        interview_questions: buildDefaultInterviewQuestions(candidate, job, mode),
        checks: normalizeAuditChecks([
          {
            id: "artifact_analysis",
            title: CANONICAL_AUDIT_CHECKS[0].title,
            summary: artifact_analysis,
          },
          {
            id: "architecture_review",
            title: CANONICAL_AUDIT_CHECKS[1].title,
            summary: githubAudit?.filesystem?.sample_paths.length
              ? `File tree from ${githubAudit.owner}/${githubAudit.repo} includes ${githubAudit.filesystem.sample_paths.slice(0, 4).join(", ")}. Module-level architecture still needs a clearer ownership map.`
              : auditBreakdown
                ? `Stored architecture_score=${auditBreakdown.architecture_score}. Live file-tree architecture proof was limited.`
                : githubAudit?.readme_excerpt
                  ? `README excerpt from ${githubAudit.owner}/${githubAudit.repo} was reviewed as a claim sheet only. No file-tree architecture proof was available.`
                  : defaultAuditCheckSummary("architecture_review"),
          },
          {
            id: "api_resiliency",
            title: CANONICAL_AUDIT_CHECKS[2].title,
            summary: githubAudit?.filesystem?.inspected
              ? `File-tree inspection found tests=${githubAudit.filesystem.test_paths.length > 0}, CI=${githubAudit.filesystem.ci_workflow_paths.length > 0}, error handling=${githubAudit.filesystem.error_handling_paths.length > 0}. README claims do not substitute for missing files.`
              : auditBreakdown
                ? `audit_breakdown pillars — tests=${auditBreakdown.test_density}, CI=${auditBreakdown.ci_cd_score}, error handling=${auditBreakdown.error_handling}.`
                : defaultAuditCheckSummary("api_resiliency"),
          },
        ]),
        github_audit: githubAudit,
        scoreCap: emptyScoreCapAudit(clampIntegrityScore(integrity_score)),
        executiveBrief: null,
      },
      githubAudit
    ),
    auditBreakdown,
    githubAudit
  );
}

async function persistScreeningResult(
  candidateKey: string | undefined,
  profileId: string | undefined,
  result: ScreenResult,
  userId: string,
  queue?: { screeningId: string; runId: string }
): Promise<boolean> {
  if (!candidateKey?.trim()) {
    return false;
  }

  try {
    const supabase = await createClient();
    const admin = createServiceRoleClient();
    const writer = admin ?? supabase;
    const key = candidateKey.trim();
    const payload = result as unknown as Record<string, unknown>;
    const requestedId = profileId?.trim() || null;
    const lookupId =
      requestedId && isProfileUuid(requestedId)
        ? requestedId
        : isProfileUuid(key)
          ? key
          : null;

    const profileRow = lookupId
      ? (await fetchProfileForCandidateId(supabase, lookupId)) ??
        (admin ? await fetchProfileForCandidateId(admin, lookupId) : null)
      : null;

    const candidateProfileId = resolvedProfileId(profileRow, lookupId);

    const screeningPayload = {
      candidate_key: key,
      created_by: userId,
      profile_id: candidateProfileId,
      integrity_score: result.integrity_score,
      status: "completed",
      audit_data: payload,
      updated_at: new Date().toISOString(),
    };

    const { data: existingScreening, error: existingScreeningError } =
      await writer
        .from("candidate_screenings")
        .select("id")
        .eq("created_by", userId)
        .eq("candidate_key", key)
        .maybeSingle();

    let screeningPersisted = false;
    const screeningUnavailable =
      existingScreeningError &&
      (existingScreeningError.code === "42P01" ||
        existingScreeningError.code === "42703" ||
        existingScreeningError.code === "PGRST205" ||
        existingScreeningError.code === "PGRST204");

    if (screeningUnavailable) {
      console.warn(
        "[screen] candidate_screenings unavailable; skipping cache persist:",
        existingScreeningError.message
      );
    } else if (existingScreeningError) {
      console.error(
        "[screen] candidate_screenings lookup failed:",
        existingScreeningError
      );
    }

    if (!screeningUnavailable) {
      const baseUpdate = existingScreening?.id
        ? writer
            .from("candidate_screenings")
            .update(screeningPayload)
            .eq("id", existingScreening.id)
            .eq("created_by", userId)
        : null;

      const guardedUpdate =
        baseUpdate && queue?.runId
          ? baseUpdate.filter("audit_data->>run_id", "eq", queue.runId)
          : baseUpdate;

      const firstWrite = guardedUpdate
        ? await guardedUpdate.select("id")
        : await writer
            .from("candidate_screenings")
            .insert(screeningPayload)
            .select("id");

      let screeningError = firstWrite.error;
      let wroteRow = Boolean(firstWrite.data?.length);

      if (screeningError?.code === "42703") {
        const { status: _status, ...withoutStatus } = screeningPayload;
        const retry = existingScreening?.id
          ? await writer
              .from("candidate_screenings")
              .update(withoutStatus)
              .eq("id", existingScreening.id)
              .eq("created_by", userId)
              .select("id")
          : await writer
              .from("candidate_screenings")
              .insert(withoutStatus)
              .select("id");
        screeningError = retry.error;
        wroteRow = Boolean(retry.data?.length);
      }

      if (screeningError) {
        console.error(
          "[screen] candidate_screenings upsert failed:",
          screeningError
        );
      } else if (wroteRow) {
        screeningPersisted = true;
      } else {
        console.warn("[screen] screening write skipped; a newer run owns the row");
      }
    }

    if (!candidateProfileId) {
      return screeningPersisted || Boolean(screeningUnavailable);
    }

    const canWriteOwnProfile = candidateProfileId === userId;
    const canWriteCandidateProfile =
      canWriteOwnProfile ||
      (profileRow != null &&
        (profileRowIsPublicToEmployers(profileRow) ||
          (await employerHasApplicantForProfile(
            admin ?? supabase,
            userId,
            profileRow,
            [lookupId]
          ))));

    if (canWriteCandidateProfile) {
      const writer = canWriteOwnProfile ? supabase : admin ?? supabase;
      const { error: profileError } = await writer
        .from("profiles")
        .update({
          integrity_score: result.integrity_score,
          audit_data: payload,
        })
        .eq("id", candidateProfileId);

      if (profileError) {
        console.error("[screen] profiles audit update failed:", profileError);
      }
    }

    return screeningPersisted || Boolean(screeningUnavailable);
  } catch (error) {
    console.error("[screen] persistScreeningResult threw:", error);
    return false;
  }
}

function resolveDeterministicMetricsForPrompt(
  githubAudit: GitHubAuditContext | null,
  auditBreakdown: ProductionAuditBreakdown | null,
  mode: ScreeningMode = "baseline"
) {
  const hiringVerdictFromFit = mode === "job_aware";
  const isUpstreamDerivative = githubAudit?.is_upstream_derivative === true;
  let promptMetrics = computeProductionAuditMetrics(
    githubAudit?.filesystem,
    undefined,
    githubAudit?.commit_history_fetched
      ? {
          commitDates: githubAudit.commit_dates,
          commitStats: githubAudit.commit_stats,
        }
      : null
  );

  if (!promptMetrics.evidence.inspected && auditBreakdown) {
    const architecture = clampScore0to100(auditBreakdown.architecture_score);
    const testing = clampScore0to100(auditBreakdown.test_density);
    const devops = clampScore0to100(auditBreakdown.ci_cd_score);
    const resilience = clampScore0to100(auditBreakdown.error_handling);
    const productionScore = clampScore0to100(
      Math.round(
        architecture * 0.35 + testing * 0.25 + devops * 0.2 + resilience * 0.2
      )
    );
    return deterministicMetricsPayload({
      productionScore: isUpstreamDerivative
        ? applyUpstreamDerivativePenalty(productionScore, true)
        : productionScore,
      isUpstreamDerivative,
      architectureScore: architecture,
      testScore: testing,
      devopsScore: devops,
      resilienceScore: resilience,
      hiringVerdictFromFit,
    });
  }

  if (promptMetrics.evidence.inspected && isUpstreamDerivative) {
    const penalized = applyUpstreamDerivativePenalty(
      promptMetrics.productionScore,
      true
    );
    promptMetrics = {
      ...promptMetrics,
      productionScore: penalized,
      codeHealthScore: penalized,
      upstreamDerivativePenalty: UPSTREAM_DERIVATIVE_PENALTY,
    };
  }

  return deterministicMetricsPayload({
    productionScore: promptMetrics.productionScore,
    isUpstreamDerivative,
    architectureScore: promptMetrics.architecture,
    testScore: promptMetrics.testing,
    devopsScore: promptMetrics.devops,
    resilienceScore: promptMetrics.resilience,
    hiringVerdictFromFit,
  });
}

async function generateGeminiScreen(
  candidate: CandidatePayload,
  job: JobPayload,
  githubAudit: GitHubAuditContext | null,
  externalProjects: ExternalProjectRecord[],
  mode: ScreeningMode,
  auditBreakdown: ProductionAuditBreakdown | null
): Promise<ScreenResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const primaryLanguage = githubAudit?.language?.trim() || "unknown";
  const jobForPrompt =
    mode === "job_aware"
      ? {
          id: asTrimmedString(job.id),
          title: job.title ?? "",
          company: job.company ?? "",
          techStack: normalizeStringArray(job.techStack ?? job.tech_stack, 12),
          requiredSkills: normalizeStringArray(
            job.requiredSkills ?? job.required_skills,
            12
          ),
          tags: normalizeStringArray(job.tags, 12),
          location: job.location ?? "",
          description: (job.description ?? "").slice(0, 1200),
        }
      : null;

  const userPrompt = JSON.stringify(
    {
      screening_mode: mode,
      candidate: {
        codename: candidate.name ?? "",
        identity_context:
          "codename is an anonymized Provix alias (e.g. Ember Echo), not a legal name. Do not compare it to the GitHub handle.",
        title: candidate.title ?? "",
        skills: normalizeStringArray(candidate.skills, 12),
        degree: candidate.degree ?? "",
        university: candidate.university ?? "",
        major: candidate.major ?? "",
        gpa: formatGpa(candidate.gpa),
        graduation_year: candidate.graduation_year ?? "",
        bio: (candidate.bio ?? "").slice(0, 600),
        experience: candidate.experience ?? "",
        projects: normalizeStringArray(candidate.projects, 6),
        github_url: resolveCandidateGitHubUrl(candidate),
      },
      job: jobForPrompt,
      audit_breakdown: auditBreakdown,
      primaryLanguage,
      languageConstraint: {
        primaryLanguage,
        rule:
          "Every recommendation and tool suggestion MUST match primaryLanguage. Do not suggest JS/TS tools unless the repo is JavaScript/TypeScript.",
        examples: {
          Go: ["go build ./...", "golangci-lint run", "go test -v ./..."],
          Python: ["pytest", "ruff", "mypy"],
          Rust: ["cargo check", "cargo clippy", "cargo test"],
          TypeScript: ["next build", "tsc", "vitest", "eslint"],
        },
      },
      scorePolicy: buildFilesystemScorePolicy(githubAudit?.filesystem),
      deterministicMetrics: resolveDeterministicMetricsForPrompt(
        githubAudit,
        auditBreakdown,
        mode
      ),
      codeFirst: true,
      resumeOptional: true,
      github_audit: githubAuditHasFetchedArtifacts(githubAudit) && githubAudit
        ? {
            ...githubAudit,
            filesystem: compactFilesystemForPrompt(githubAudit.filesystem),
          }
        : null,
      external_projects: externalProjects.map((project: (typeof externalProjects)[number]) => ({
        project_title: project.project_title,
        project_url: project.project_url,
        description: project.description.slice(0, 4000),
      })),
    },
    null,
    2
  );

  let lastError: unknown;
  const systemInstruction = buildSystemPrompt(mode);

  for (const model of MODEL_CANDIDATES) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: SCREEN_RESPONSE_SCHEMA,
            temperature: 0,
          },
        });

        const text = response.text?.trim();

        if (!text) {
          throw new Error(`Gemini (${model}) returned an empty response.`);
        }

        const normalized = normalizeScreenResult(
          JSON.parse(text),
          candidate,
          job,
          mode
        );
        return finalizeScreenWithBreakdown(
          applyScreenFilesystemCap(
            {
              ...normalized,
              github_audit: githubAudit,
            },
            githubAudit
          ),
          auditBreakdown,
          githubAudit
        );
      } catch (error) {
        lastError = error;
        console.error(
          `Gemini screen failed for model ${model}${
            attempt > 0 ? " (retry)" : ""
          }:`,
          error
        );
        if (attempt === 0 && isGeminiUnavailableError(error)) {
          await sleep(1000);
          continue;
        }
        break;
      }
    }
  }

  console.warn(
    "[screen] Gemini unavailable; using deterministic fallback screen",
    lastError
  );
  return buildFallbackScreen(
    candidate,
    job,
    githubAudit,
    mode,
    auditBreakdown
  );
}

export async function POST(request: Request) {
  const access = await requireAiApiUser();
  if (access instanceof NextResponse) {
    return access;
  }

  const unverified = await rejectUnlessVerifiedEmployer(access);
  if (unverified) {
    return unverified;
  }

  const parsedBody = await parseJsonWithSchema(request, screenRequestBodySchema);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const { candidate_key, profile_id } = parsedBody.data;
  const rawJob = (parsedBody.data.job ?? {}) as JobPayload;
  const job = isValidScreeningJobContext(rawJob) ? rawJob : {};
  const mode = resolveScreeningMode(
    job,
    parsedBody.data.screening_mode ?? null
  );
  let candidate = parsedBody.data.candidate as CandidatePayload;
  let auditBreakdown = parseProductionAuditBreakdown(
    parsedBody.data.audit_breakdown
  );

  const lookupId =
    profile_id && isProfileUuid(profile_id) ? profile_id.trim() : null;

  if (lookupId) {
    const admin = createServiceRoleClient();
    const profileRow =
      (await fetchProfileForCandidateId(access.supabase, lookupId)) ??
      (admin ? await fetchProfileForCandidateId(admin, lookupId) : null);

    if (profileRow) {
      candidate = hydrateScreenCandidateFromProfile(candidate, profileRow);
      if (!auditBreakdown) {
        auditBreakdown = parseProductionAuditBreakdown(
          profileRow.audit_breakdown
        );
      }
    } else {
      console.warn("[screen] could not resolve candidate profile row", {
        profile_id,
        candidate_key,
      });
    }
  }

  const candidateKey = candidate_key?.trim();
  if (!candidateKey) {
    return NextResponse.json(
      { error: "candidate_key is required to queue a screening." },
      { status: 400 }
    );
  }

  const jobInput: ScreeningJobInput = {
    candidate: candidate as unknown as Record<string, unknown>,
    job: {
      ...(job as unknown as Record<string, unknown>),
      screening_mode: mode,
      audit_breakdown: auditBreakdown,
    },
    profileId: profile_id?.trim() || lookupId,
  };

  const queued = await enqueuePendingScreening(access.supabase, {
    userId: access.user.id,
    candidateKey,
    profileId: lookupId,
    input: jobInput,
  });

  if (queued.ok) {
    const snapshot = {
      userId: access.user.id,
      screeningId: queued.row.id,
      runId: queued.row.runId,
      candidate,
      job,
      mode,
      auditBreakdown,
      candidateKey,
      profileId: profile_id,
      lookupId,
    };

    after(() => {
      void runQueuedScreening(snapshot);
    });

    return NextResponse.json(
      {
        accepted: true,
        status: "pending",
        screening_id: queued.row.id,
        candidate_key: queued.row.candidateKey,
        run_id: queued.row.runId,
      },
      { status: 202 }
    );
  }

  console.warn("[screen] queue storage unavailable; running live audit inline", {
    unavailable: queued.unavailable,
    error: queued.error,
  });

  try {
    const writer = createServiceRoleClient() ?? access.supabase;
    const result = await executeLiveScreening({
      candidate,
      job,
      mode,
      auditBreakdown,
      lookupId,
      writer,
    });

    try {
      await persistScreeningResult(
        candidateKey,
        profile_id,
        result,
        access.user.id
      );
    } catch (persistError) {
      console.warn("[screen] inline persist skipped:", persistError);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[screen] inline live audit failed:", error);
    // Never 500 solely because audit_breakdown was missing — fall back to a
    // deterministic screen from whatever repo signals we can gather.
    try {
      const githubUrl = resolveCandidateGitHubUrl(candidate);
      let githubAudit: GitHubAuditContext | null = null;
      try {
        if (githubUrl) {
          githubAudit = await fetchGitHubAudit(githubUrl);
        }
      } catch {
        githubAudit = null;
      }
      const fallback = buildFallbackScreen(
        candidate,
        job,
        githubAudit,
        mode,
        auditBreakdown
      );
      return NextResponse.json(fallback);
    } catch (fallbackError) {
      console.error("[screen] fallback screen failed:", fallbackError);
      return NextResponse.json(
        {
          error: "The live GitHub audit could not be completed. Please retry.",
          retryable: true,
        },
        { status: 500 }
      );
    }
  }
}

async function executeLiveScreening(args: {
  candidate: CandidatePayload;
  job: JobPayload;
  mode: ScreeningMode;
  auditBreakdown: ProductionAuditBreakdown | null;
  lookupId: string | null;
  writer: SupabaseClient;
}): Promise<ScreenResult> {
  const githubUrl =
    resolveCandidateGitHubUrl(args.candidate) ||
    asTrimmedString(args.auditBreakdown?.audited_repo_url) ||
    null;
  let githubAudit: GitHubAuditContext | null = null;

  try {
    if (githubUrl) {
      githubAudit = await fetchGitHubAudit(githubUrl);
    }
  } catch (error) {
    console.error("[screen] GitHub fetch sequence failed:", error);
    // Missing/failed live fetch is non-fatal when audit_breakdown exists.
    githubAudit = args.auditBreakdown
      ? null
      : emptyGitHubAuditContext({
          repo_url: githubUrl ?? "",
          fetch_warnings: [
            "The GitHub fetch sequence timed out or dropped. Retry the live audit to reload repository artifacts.",
          ],
        });
  }

  let externalProjects: ExternalProjectRecord[] = [];
  if (
    args.lookupId &&
    (!githubUrl || !githubAuditHasFetchedArtifacts(githubAudit)) &&
    !args.auditBreakdown
  ) {
    const { data, error } = await args.writer
      .from("external_projects")
      .select("project_title, project_url, description, created_at")
      .eq("user_id", args.lookupId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[screen] failed to load external_projects:", error);
    } else {
      externalProjects = normalizeExternalProjects(data);
    }
  }

  return generateGeminiScreen(
    args.candidate,
    args.job,
    githubAudit,
    hasUsableExternalProjects(externalProjects) ? externalProjects : [],
    args.mode,
    args.auditBreakdown
  );
}

async function runQueuedScreening(snapshot: {
  userId: string;
  screeningId: string;
  runId: string;
  candidate: CandidatePayload;
  job: JobPayload;
  mode: ScreeningMode;
  auditBreakdown: ProductionAuditBreakdown | null;
  candidateKey: string;
  profileId?: string;
  lookupId: string | null;
}): Promise<void> {
  const writer = createServiceRoleClient() ?? (await createClient());
  const input: ScreeningJobInput = {
    candidate: snapshot.candidate as unknown as Record<string, unknown>,
    job: {
      ...(snapshot.job as unknown as Record<string, unknown>),
      screening_mode: snapshot.mode,
      audit_breakdown: snapshot.auditBreakdown,
    },
    profileId: snapshot.profileId?.trim() || snapshot.lookupId,
  };

  const claimed = await markScreeningProcessing(writer, {
    screeningId: snapshot.screeningId,
    userId: snapshot.userId,
    runId: snapshot.runId,
    input,
  });

  if (!claimed) {
    return;
  }

  try {
    const stale = async () => {
      const currentRunId = await readQueuedRunId(
        writer,
        snapshot.screeningId,
        snapshot.userId
      );
      return Boolean(currentRunId && currentRunId !== snapshot.runId);
    };

    if (await stale()) {
      return;
    }

    const result = await executeLiveScreening({
      candidate: snapshot.candidate,
      job: snapshot.job,
      mode: snapshot.mode,
      auditBreakdown: snapshot.auditBreakdown,
      lookupId: snapshot.lookupId,
      writer,
    });

    if (await stale()) {
      return;
    }

    const persisted = await persistScreeningResult(
      snapshot.candidateKey,
      snapshot.profileId,
      result,
      snapshot.userId,
      { screeningId: snapshot.screeningId, runId: snapshot.runId }
    );

    if (persisted) {
      await completeScreeningRun(writer, {
        screeningId: snapshot.screeningId,
        userId: snapshot.userId,
        runId: snapshot.runId,
        profileId: snapshot.lookupId,
        integrityScore: result.integrity_score,
        auditData: result as unknown as Record<string, unknown>,
      });
    } else {
      await failScreeningRun(writer, {
        screeningId: snapshot.screeningId,
        userId: snapshot.userId,
        runId: snapshot.runId,
        input,
        error: "The live audit finished but could not be saved. Please retry.",
      });
    }
  } catch (error) {
    console.error("[screen] background audit failed:", error);
    try {
      const fallback = buildFallbackScreen(
        snapshot.candidate,
        snapshot.job,
        null,
        snapshot.mode,
        snapshot.auditBreakdown
      );
      const persisted = await persistScreeningResult(
        snapshot.candidateKey,
        snapshot.profileId,
        fallback,
        snapshot.userId,
        { screeningId: snapshot.screeningId, runId: snapshot.runId }
      );
      if (persisted) {
        await completeScreeningRun(writer, {
          screeningId: snapshot.screeningId,
          userId: snapshot.userId,
          runId: snapshot.runId,
          profileId: snapshot.lookupId,
          integrityScore: fallback.integrity_score,
          auditData: fallback as unknown as Record<string, unknown>,
        });
        return;
      }
    } catch (fallbackError) {
      console.error("[screen] queued fallback failed:", fallbackError);
    }
    await failScreeningRun(writer, {
      screeningId: snapshot.screeningId,
      userId: snapshot.userId,
      runId: snapshot.runId,
      input,
      error: "The live GitHub audit could not be completed. Please retry.",
    });
  }
}
