import { GoogleGenAI, Type } from "@google/genai";
import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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
import {
  employerHasApplicantForProfile,
  fetchProfileForCandidateId,
  hydrateScreenCandidateFromProfile,
  isProfileUuid,
  resolvedProfileId,
} from "@/lib/resolve-candidate-profile";
import { clampScore0to100 } from "@/lib/score-scale";
import {
  applyFilesystemScoreCap,
  buildFilesystemScorePolicy,
  compactFilesystemForPrompt,
  emptyScoreCapAudit,
  MISSING_CORE_ARTIFACT_SCORE_CAP,
  parseScoreCapAudit,
  UNINSPECTED_OR_MULTIPLE_MISSING_SCORE_CAP,
  type ScoreCapAudit,
} from "@/lib/repo-filesystem";
import {
  computeProductionAuditMetrics,
  emptyProductionAuditMetrics,
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
  completeScreeningRun,
  enqueuePendingScreening,
  failScreeningRun,
  markScreeningProcessing,
  readQueuedRunId,
  type ScreeningJobInput,
} from "@/lib/screening-queue";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 120;

type CandidatePayload = {
  name?: string;
  title?: string;
  bio?: string;
  skills?: string[] | string;
  degree?: string;
  university?: string;
  major?: string;
  gpa?: string;
  graduation_year?: string;
  experience?: string;
  projects?: string[] | string;
  github_url?: string;
  github?: string;
};

type JobPayload = {
  title?: string;
  company?: string;
  tags?: string[] | string;
  tech_stack?: string[] | string;
  techStack?: string[] | string;
  required_skills?: string[] | string;
  requiredSkills?: string[] | string;
  location?: string;
  description?: string;
};

export type { GitHubAuditContext };

export type InterviewQuestion = {
  question: string;
  category: string;
  what_to_listen_for: string;
};

export type { ScoreCapAudit };

export type { ProductionAuditMetrics };

export type ScreenResult = {
  integrity_score: number;
  timeline_flags: string[];
  artifact_analysis: string;
  technical_depth_summary: string;
  interview_questions: InterviewQuestion[];
  checks: AuditCheck[];
  github_audit?: GitHubAuditContext | null;
  scoreCap: ScoreCapAudit;
  metrics: ProductionAuditMetrics;
};

const SYSTEM_PROMPT = `You are a rigorous Technical & Academic Auditor for Provix employer screening.

Provix is an anonymized talent platform. The candidate's display name is a generated codename (for example "Ember Echo"), not a legal identity. GitHub handles, GitHub profile names, and resume bylines are expected to differ from that codename.

You receive:
- Candidate profile claims (codename, skills, bio, degree, experience level, projects)
- Target job requirements
- Optional live GitHub repository audit data (stars, forks, creation date, language, recent commits, README excerpt, and filesystem file-tree inspection)
- Optional external_projects artifacts (project titles, live/documentation URLs, and technical breakdowns) when GitHub is private, enterprise-only, or a ghost/empty public profile
- scorePolicy: hard numeric caps computed from the file tree. You must obey appliedMaxScore.

Perform three artifact checks plus a chronological timeline conflict check:
- Check 1 artifact_analysis: README quality, commit history, repo age, languages, live/docs URLs, and whether artifacts support claimed skills. README is a claim sheet, not file-system proof.
- Check 2 architecture_review: system design signals, folder/module structure from the file tree, and whether the candidate demonstrates architectural thinking.
- Check 3 api_resiliency: API design, data handling, error handling, and production resiliency signals. Tests, CI workflows, and error handling pass only if filesystem.test_paths, filesystem.ci_workflow_paths, and filesystem.error_handling_paths contain real paths. If evidence is thin, say so explicitly.
- timeline_flags: chronological conflicts (years of experience exceeding a framework's release date, overlapping impossible dates, or bio claims not supported by commit history).
- Be skeptical but fair; cite concrete file paths from filesystem inspection when available. Repo metadata and external project write-ups are secondary.
- Do not treat GitHub handle, GitHub login, or GitHub profile name vs Provix display name/codename as a red flag, identity issue, or scoring penalty. Never add a timeline_flag or lower integrity_score because those strings do not match.
- CODE-FIRST: A missing resume, CV, or experience summary must not lower integrity_score and must not appear in timeline_flags. Score from GitHub file-tree artifacts, commits, and project write-ups. If a resume is present, use it only to check claim-vs-code mismatches.
- If github_audit is missing or empty and external_projects are present, evaluate those write-ups and live/docs URLs for qualitative notes instead of failing the screen for a missing public repository. Write-ups still cannot raise the score above the file-system caps.

FILE-SYSTEM EVIDENCE VS PROSE:
- Prose descriptions, README summaries, resume bullets, and external project write-ups can never override missing code artifacts.
- If a README says the repo has tests, CI, or error handling but the matching filesystem path list is empty, treat that artifact as missing.
- If any core technical requirement is missing from repo inspection (test suite, CI workflow, or explicit error-handling files), integrity_score MUST be at most ${MISSING_CORE_ARTIFACT_SCORE_CAP}.
- If two or more core requirements are missing, or filesystem.inspected is false, integrity_score MUST be at most ${UNINSPECTED_OR_MULTIPLE_MISSING_SCORE_CAP}.
- Scores above 80 require concrete file-system proof: inspected file tree plus non-empty test_paths, ci_workflow_paths, and error_handling_paths. Cite those paths.
- Never exceed scorePolicy.appliedMaxScore.

Return strict JSON only in this exact structure:
{
  "integrity_score": number (integer 0-100, already capped per file-system rules),
  "timeline_flags": ["flag1", "flag2"],
  "artifact_analysis": "Concise paragraph on repository/proof-of-work authenticity (same content as Check 1).",
  "technical_depth_summary": "Concise paragraph on demonstrated technical depth vs role requirements.",
  "interview_questions": [
    {
      "question": "Tailored interview question",
      "category": "Architecture / Process | Metric Verification | Technical Depth",
      "what_to_listen_for": "Concise coaching tip on strong vs weak answers."
    }
  ],
  "checks": [
    {
      "id": "artifact_analysis",
      "title": "Artifact Analysis (Check 1)",
      "summary": "1-3 sentence paragraph"
    },
    {
      "id": "architecture_review",
      "title": "Architecture Review (Check 2)",
      "summary": "1-3 sentence paragraph"
    },
    {
      "id": "api_resiliency",
      "title": "API & Data Resiliency Check (Check 3)",
      "summary": "1-3 sentence paragraph"
    }
  ]
}

Also generate an Employer Interview Cheat Sheet:
- Provide exactly 3 tailored, role-specific interview questions grounded in the candidate's verified skills, artifacts, GitHub audit (if any), and stated claims.
- Each question must include a category badge label and a concise what_to_listen_for tip for hiring managers.

Rules:
- integrity_score: 0-100 integer; 0 is the absolute minimum, 100 is the maximum. Lower when red flags dominate, higher when claims align with file-system artifacts. Apply the hard caps above. Do not deduct points for GitHub handle / display-name mismatch. Do not deduct points for a missing resume.
- timeline_flags: array of specific red-flag strings; empty array if none. Never include flags about GitHub handle, username, or login not matching the candidate display name or codename. Never include a missing resume, CV, or experience summary. Include missing tests/CI/error-handling files when those path lists are empty.
- checks: exactly 3 objects in this order. Each summary is 1-3 sentences, no markdown. Do not mention handle-vs-name mismatch.
- artifact_analysis should match Check 1. technical_depth_summary remains a separate overall depth paragraph.
- interview_questions: exactly 3 objects; categories should vary (e.g., Architecture / Process, Metric Verification, Technical Depth).
- Do not include extra keys or markdown fences.`;

const SCREEN_CHECK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    id: {
      type: Type.STRING,
      description:
        "One of artifact_analysis, architecture_review, or api_resiliency.",
    },
    title: { type: Type.STRING },
    summary: { type: Type.STRING },
  },
  required: ["id", "title", "summary"],
};

const SCREEN_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    integrity_score: {
      type: Type.INTEGER,
      description:
        "Integrity score from 0 to 100 based on code artifacts. Do not lower the score for a missing resume. Max 60 if any core file-system artifact is missing, max 50 if two or more are missing or the file tree was not inspected, and above 80 only with file-system proof of tests, CI, and error handling.",
    },
    timeline_flags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Red flags from artifact or timeline review. Do not include GitHub handle vs display-name/codename mismatch. Do not include a missing resume.",
    },
    artifact_analysis: {
      type: Type.STRING,
    },
    technical_depth_summary: {
      type: Type.STRING,
    },
    interview_questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          category: { type: Type.STRING },
          what_to_listen_for: { type: Type.STRING },
        },
        required: ["question", "category", "what_to_listen_for"],
      },
    },
    checks: {
      type: Type.ARRAY,
      description:
        "Exactly three artifact checks: Artifact Analysis, Architecture Review, and API & Data Resiliency.",
      items: SCREEN_CHECK_SCHEMA,
    },
  },
  required: [
    "integrity_score",
    "timeline_flags",
    "artifact_analysis",
    "technical_depth_summary",
    "interview_questions",
    "checks",
  ],
};

const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-1.5-flash",
  "gemini-3.6-flash",
  "gemini-2.0-flash",
] as const;

const HANDLE_MISMATCH_PATTERN =
  /\b(mismatch|does not match|doesn't match|do not match|don't match|inconsistent|discrepan|unrelated|not (the )?same|differs? from|no(t)? overlap)\b/i;

function isGithubHandleDisplayNameFlag(flag: string): boolean {
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

  const metrics = computeProductionAuditMetrics(githubAudit?.filesystem);
  let integrity_score = capped.score;

  if (metrics.evidence.inspected) {
    integrity_score = clampIntegrityScore(
      Math.round(capped.score * 0.45 + metrics.productionScore * 0.55)
    );
    const reCapped = applyFilesystemScoreCap(
      {
        score: integrity_score,
        redFlags: capped.redFlags,
      },
      githubAudit?.filesystem,
      8
    );
    return {
      ...result,
      integrity_score: reCapped.score,
      timeline_flags: reCapped.redFlags,
      scoreCap: reCapped.scoreCap,
      metrics,
    };
  }

  return {
    ...result,
    integrity_score: capped.score,
    timeline_flags: capped.redFlags,
    scoreCap: capped.scoreCap,
    metrics,
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

  return questions.slice(0, 3);
}

function buildDefaultInterviewQuestions(
  candidate: CandidatePayload,
  job: JobPayload
): InterviewQuestion[] {
  const roleLabel = job.title ?? candidate.title ?? "this role";
  const topSkill =
    normalizeStringArray(candidate.skills, 1)[0] ?? "your primary stack";

  return [
    {
      question: `Walk me through how you architected and shipped a recent ${roleLabel} project using ${topSkill}. What trade-offs did you make?`,
      category: "Architecture / Process",
      what_to_listen_for:
        "Strong answers cite concrete components, decision rationale, and constraints. Weak answers stay abstract with no personal ownership.",
    },
    {
      question: `What measurable outcome did you deliver in your most relevant project for ${roleLabel}, and how did you validate it?`,
      category: "Metric Verification",
      what_to_listen_for:
        "Strong answers include baseline, metric, and verification method. Weak answers rely on vanity metrics or cannot explain measurement.",
    },
    {
      question: `Describe a hard technical problem you solved with ${topSkill}. How did you debug it and what would you do differently?`,
      category: "Technical Depth",
      what_to_listen_for:
        "Strong answers show step-by-step debugging and lessons learned. Weak answers skip implementation details or blame external factors.",
    },
  ];
}

function normalizeScreenResult(
  raw: unknown,
  candidate: CandidatePayload,
  job: JobPayload
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
  while (interview_questions.length < 3) {
    const defaults = buildDefaultInterviewQuestions(candidate, job);
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
    interview_questions: interview_questions.slice(0, 3),
    checks,
    scoreCap:
      parseScoreCapAudit(record.scoreCap) ?? emptyScoreCapAudit(restoredScore),
    metrics: emptyProductionAuditMetrics(),
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
  githubAudit: GitHubAuditContext | null
): ScreenResult {
  const skills = normalizeStringArray(candidate.skills, 8);
  const jobTags = [
    ...normalizeStringArray(job.techStack ?? job.tech_stack, 8),
    ...normalizeStringArray(job.requiredSkills ?? job.required_skills, 8),
    ...normalizeStringArray(job.tags, 8),
  ];
  const overlap = jobTags.filter((tag) =>
    skills.some(
      (skill) =>
        skill.toLowerCase().includes(tag.toLowerCase()) ||
        tag.toLowerCase().includes(skill.toLowerCase())
    )
  );

  const timeline_flags: string[] = [];
  let integrity_score = overlap.length * 12;

  if (githubAudit) {
    integrity_score += Math.min(25, githubAudit.commit_count_sampled * 5);

    if (githubAudit.commit_count_sampled <= 1) {
      timeline_flags.push(
        "Repository shows minimal commit history relative to claimed project ownership."
      );
      integrity_score -= 15;
    }

    if (githubAudit.readme_excerpt) {
      integrity_score += 15;
    } else {
      timeline_flags.push(
        "No README found — limited evidence of documented architecture or setup."
      );
      integrity_score -= 8;
    }

    if (githubAudit.fetch_warnings.length > 0) {
      timeline_flags.push(...githubAudit.fetch_warnings.slice(0, 2));
    }
  } else {
    timeline_flags.push(
      "No auditable GitHub repository URL was provided for live artifact verification."
    );
  }

  const roleLabel = job.title ?? "this role";
  const artifact_analysis = githubAudit
    ? `Fallback audit of ${githubAudit.owner}/${githubAudit.repo}: ${githubAudit.commit_count_sampled} recent commits sampled, primary language ${githubAudit.language ?? "unknown"}.`
    : "Fallback screening could not verify proof-of-work artifacts against a public GitHub repository.";

  return applyScreenFilesystemCap(
    {
      integrity_score: clampIntegrityScore(integrity_score),
      timeline_flags,
      artifact_analysis,
      technical_depth_summary: `Skill overlap with ${roleLabel}: ${overlap.join(", ") || skills.slice(0, 2).join(", ") || "limited explicit matches"}.`,
      interview_questions: buildDefaultInterviewQuestions(candidate, job),
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
            : githubAudit?.readme_excerpt
            ? `README excerpt from ${githubAudit.owner}/${githubAudit.repo} was reviewed as a claim sheet only. No file-tree architecture proof was available.`
            : defaultAuditCheckSummary("architecture_review"),
        },
        {
          id: "api_resiliency",
          title: CANONICAL_AUDIT_CHECKS[2].title,
          summary: githubAudit?.filesystem?.inspected
            ? `File-tree inspection found tests=${githubAudit.filesystem.test_paths.length > 0}, CI=${githubAudit.filesystem.ci_workflow_paths.length > 0}, error handling=${githubAudit.filesystem.error_handling_paths.length > 0}. README claims do not substitute for missing files.`
            : defaultAuditCheckSummary("api_resiliency"),
        },
      ]),
      github_audit: githubAudit,
      scoreCap: emptyScoreCapAudit(clampIntegrityScore(integrity_score)),
    },
    githubAudit
  );
}

function isValidRequestBody(
  body: unknown
): body is {
  candidate: CandidatePayload;
  job: JobPayload;
  candidate_key?: string;
  profile_id?: string;
} {
  if (!body || typeof body !== "object") {
    return false;
  }

  const record = body as {
    candidate?: CandidatePayload;
    job?: JobPayload;
  };

  return (
    !!record.candidate &&
    typeof record.candidate === "object" &&
    !!record.job &&
    typeof record.job === "object"
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

async function generateGeminiScreen(
  candidate: CandidatePayload,
  job: JobPayload,
  githubAudit: GitHubAuditContext | null,
  externalProjects: ExternalProjectRecord[]
): Promise<ScreenResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const userPrompt = JSON.stringify(
    {
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
      job: {
        title: job.title ?? "",
        company: job.company ?? "",
        techStack: normalizeStringArray(job.techStack ?? job.tech_stack, 12),
        requiredSkills: normalizeStringArray(
          job.requiredSkills ?? job.required_skills,
          12
        ),
        tags: normalizeStringArray(job.tags, 12),
        location: job.location ?? "",
        description: (job.description ?? "").slice(0, 400),
      },
      scorePolicy: buildFilesystemScorePolicy(githubAudit?.filesystem),
      codeFirst: true,
      resumeOptional: true,
      github_audit: githubAuditHasFetchedArtifacts(githubAudit) && githubAudit
        ? {
            ...githubAudit,
            filesystem: compactFilesystemForPrompt(githubAudit.filesystem),
          }
        : null,
      external_projects: externalProjects.map((project) => ({
        project_title: project.project_title,
        project_url: project.project_url,
        description: project.description.slice(0, 4000),
      })),
    },
    null,
    2
  );

  let lastError: unknown;

  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: SCREEN_RESPONSE_SCHEMA,
          temperature: 0,
        },
      });

      const text = response.text?.trim();

      if (!text) {
        throw new Error(`Gemini (${model}) returned an empty response.`);
      }

      const normalized = normalizeScreenResult(JSON.parse(text), candidate, job);
      return applyScreenFilesystemCap(
        {
          ...normalized,
          github_audit: githubAudit,
        },
        githubAudit
      );
    } catch (error) {
      lastError = error;
      console.error(`Gemini screen failed for model ${model}:`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Gemini models failed.");
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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isValidRequestBody(body)) {
    return NextResponse.json(
      {
        error:
          "Request body must include candidate and job objects with the expected fields.",
      },
      { status: 400 }
    );
  }

  const record = body as {
    candidate: CandidatePayload;
    job: JobPayload;
    candidate_key?: string;
    profile_id?: string;
  };

  const { job, candidate_key, profile_id } = record;
  let { candidate } = record;

  const lookupId =
    (profile_id && isProfileUuid(profile_id) ? profile_id.trim() : null) ||
    (candidate_key && isProfileUuid(candidate_key) ? candidate_key.trim() : null);

  if (lookupId) {
    const admin = createServiceRoleClient();
    const profileRow =
      (await fetchProfileForCandidateId(access.supabase, lookupId)) ??
      (admin ? await fetchProfileForCandidateId(admin, lookupId) : null);

    if (profileRow) {
      candidate = hydrateScreenCandidateFromProfile(candidate, profileRow);
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
    job: job as unknown as Record<string, unknown>,
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
    return NextResponse.json(
      {
        error: "The live GitHub audit could not be completed. Please retry.",
        retryable: true,
      },
      { status: 500 }
    );
  }
}

async function executeLiveScreening(args: {
  candidate: CandidatePayload;
  job: JobPayload;
  lookupId: string | null;
  writer: SupabaseClient;
}): Promise<ScreenResult> {
  const githubUrl = resolveCandidateGitHubUrl(args.candidate);
  let githubAudit: GitHubAuditContext | null = null;

  try {
    if (githubUrl) {
      githubAudit = await fetchGitHubAudit(githubUrl);
    }
  } catch (error) {
    console.error("[screen] GitHub fetch sequence failed:", error);
    githubAudit = emptyGitHubAuditContext({
      repo_url: githubUrl ?? "",
      fetch_warnings: [
        "The GitHub fetch sequence timed out or dropped. Retry the live audit to reload repository artifacts.",
      ],
    });
  }

  let externalProjects: ExternalProjectRecord[] = [];
  if (
    args.lookupId &&
    (!githubUrl || !githubAuditHasFetchedArtifacts(githubAudit))
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
    hasUsableExternalProjects(externalProjects) ? externalProjects : []
  );
}

async function runQueuedScreening(snapshot: {
  userId: string;
  screeningId: string;
  runId: string;
  candidate: CandidatePayload;
  job: JobPayload;
  candidateKey: string;
  profileId?: string;
  lookupId: string | null;
}): Promise<void> {
  const writer = createServiceRoleClient() ?? (await createClient());
  const input: ScreeningJobInput = {
    candidate: snapshot.candidate as unknown as Record<string, unknown>,
    job: snapshot.job as unknown as Record<string, unknown>,
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
    await failScreeningRun(writer, {
      screeningId: snapshot.screeningId,
      userId: snapshot.userId,
      runId: snapshot.runId,
      input,
      error: "The live GitHub audit could not be completed. Please retry.",
    });
  }
}
