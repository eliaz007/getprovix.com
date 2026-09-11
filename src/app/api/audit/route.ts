import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import {
  CANONICAL_AUDIT_CHECKS,
  normalizeAuditChecks,
  type AuditCheck,
} from "@/lib/audit-checks";
import {
  DAILY_LIMIT_API_MESSAGE,
  incrementDailyScanUsage,
  loadDailyScanUsage,
  resolveDailyScanUsage,
  type DailyScanUsage,
} from "@/lib/daily-scan-limit";
import {
  hasUsableExternalProjects,
  mergeExternalProjects,
  normalizeExternalProjects,
  parseWorkIsPrivate,
  shouldUseExternalProjectFallback,
  type ExternalProjectRecord,
} from "@/lib/external-projects";
import {
  fetchGitHubProfileArtifacts,
  githubArtifactAuditSucceeded,
  githubAuditHasFetchedArtifacts,
  githubAuditLooksInaccessible,
  type GitHubArtifactAudit,
} from "@/lib/github-audit";
import {
  AUDIT_MISSING_GITHUB_OR_ARTIFACT_MESSAGE,
  hasUsableGitHubAuditTarget,
  isGitHubPlaceholderInput,
  normalizeGitHubAuditTarget,
} from "@/lib/validate-github-url";
import {
  consumeRateLimit,
  getRequestIp,
  tooManyRequestsResponse,
} from "@/lib/ip-rate-limit";
import { extractResumeTextFromFile } from "@/lib/parse-resume";
import { RESUME_TEXT_LIMIT } from "@/lib/resume-file";
import { clampScore0to100 } from "@/lib/score-scale";
import { normalizeCommitDates } from "@/lib/audit-readiness";
import {
  applyFilesystemScoreCap,
  buildFilesystemScorePolicy,
  compactFilesystemForPrompt,
  emptyScoreCapAudit,
  MISSING_CORE_ARTIFACT_SCORE_CAP,
  parseRepoFilesystemEvidence,
  parseScoreCapAudit,
  strongestFilesystemEvidence,
  UNINSPECTED_OR_MULTIPLE_MISSING_SCORE_CAP,
  type RepoFilesystemEvidence,
  type ScoreCapAudit,
} from "@/lib/repo-filesystem";
import {
  computeProductionAuditMetrics,
  emptyProductionAuditMetrics,
  type ProductionAuditMetrics,
} from "@/lib/production-audit-metrics";
import { createClient } from "@/utils/supabase/server";
import {
  buildProductionAuditClaim,
  persistProfileProductionAudit,
  PRIVATE_AUDITED_REPO_LABEL,
} from "@/lib/production-audit";

export const runtime = "nodejs";

export type AuditRequestBody = {
  targetRole?: string;
  githubUrl?: string;
  resumeSummary?: string;
  compensationLevel?: string;
  workIsPrivate?: boolean;
  externalProjects?: ExternalProjectRecord[];
};

export type { AuditCheck };

export type { ScoreCapAudit };

export type { ProductionAuditMetrics };

export type AuditResult = {
  score: number;
  strengths: string[];
  redFlags: string[];
  recommendations: string[];
  checks: AuditCheck[];
  scoreCap: ScoreCapAudit;
  /** File-tree-derived scorecard: CI/CD, tests, error boundaries, weighted total. */
  metrics: ProductionAuditMetrics;
  filesystem: RepoFilesystemEvidence | null;
  commitDates: string[];
  inaccessibleRepo?: boolean;
};

const SYSTEM_PROMPT = `You are a brutal, cynical Principal Software Engineer and Technical Recruiter. Your job is to rip apart developer portfolios, GitHub repositories, external project write-ups, and resumes to find real flaws.

RULES FOR YOUR AUDIT:
1. NO BUZZWORDS: Never use words like "resiliency," "robust," "seamless," "leverage," "cutting-edge," or "paradigm." Speak in plain, direct, technical English.
2. CITE SPECIFIC EVIDENCE: You are forbidden from claiming a code flaw or strength unless you can point to a specific file path from filesystem inspection, file type, directory pattern, commit history detail, live/documentation URL, or technical-breakdown detail you actually observed in the provided artifacts.
3. HARSH SCORING: Grade out of 100 like a strict employer. Start at 100 and aggressively deduct points for missing production standards (e.g., missing error boundaries, lack of tests, empty READMEs, or shallow tutorial code). A score of 100 requires production-grade architecture AND file-system proof of tests, CI, and error handling.
4. CODE-FIRST: Provix scores repositories and file-system artifacts, not paperwork. A missing resume or experience summary must not lower the score and must not appear in redFlags. If resumeText is empty, ignore that absence. If a resume is present, use it only to check claim-vs-code mismatches.
5. CALL OUT DISCREPANCIES: If the resume claims advanced capabilities (like distributed systems or complex state management) but the GitHub repo or external project write-up is a basic template, you must penalize the score heavily and state the mismatch explicitly.
6. FILE-SYSTEM EVIDENCE VS PROSE: README text, resume bullets, commit messages, and external project write-ups are claims, not proof. They must never override missing code artifacts. If filesystem.test_paths, filesystem.ci_workflow_paths, or filesystem.error_handling_paths is empty, that artifact is missing — even if a README or write-up describes tests, CI, or error handling. Do not invent files that are not listed.
7. HARD SCORE CAPS:
   - If any core technical requirement is missing from repo inspection (test suite, CI workflow, or explicit error-handling files), the score MUST be at most ${MISSING_CORE_ARTIFACT_SCORE_CAP}.
   - If two or more core requirements are missing, or filesystem.inspected is false, the score MUST be at most ${UNINSPECTED_OR_MULTIPLE_MISSING_SCORE_CAP}.
   - Scores above 80 are forbidden unless filesystem.inspected is true AND test_paths, ci_workflow_paths, and error_handling_paths are all non-empty. Cite those paths as proof.
   - Honor scorePolicy.appliedMaxScore. Never exceed it. Never raise the score because the prose sounded production-grade.
8. PRIVATE / ENTERPRISE FALLBACK: If workIsPrivate is true, no public GitHub repository is available, or githubArtifacts are empty/thin (ghost repository), do NOT fail the audit for a missing public repo. Evaluate externalProjects for qualitative checks (architecture notes, APIs, ownership). Those write-ups remain prose: they cannot substitute for missing file-system artifacts and cannot raise the score above the caps in rule 7. Never say the audit could not be completed solely because GitHub is private.

Return strict JSON only:
{
  "score": number (integer 0-100 after deductions from 100, already capped per rule 7),
  "strengths": ["strength cited with a file path, file type, directory pattern, or commit-history detail", "..."],
  "redFlags": ["flaw or resume/repo mismatch cited with evidence", "..."],
  "recommendations": ["specific fix", "...", "..."],
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

JSON field rules:
- score: integer 0-100. Start at 100 and deduct. Apply the hard caps in rule 7 before returning. 100 is only for production-grade architecture with file-system proof of tests, CI, and error handling. Do not deduct for a missing resume.
- strengths: 3-5 bullets. Each must cite a file path, file type, directory pattern, commit-history detail, live/documentation URL, or technical-breakdown detail from the provided artifacts. If you cannot cite it, omit it. Do not cite README claims as proof of tests, CI, or error handling.
- redFlags: 2-5 bullets. Include resume claims that the GitHub or external-project artifacts do not support. If core files are missing from the file tree, say so. Do not treat a missing public GitHub repo as a hard fail when externalProjects were provided or workIsPrivate is true. Never list a missing resume, CV, or experience summary as a red flag.
- recommendations: exactly 3 specific, actionable fixes.
- checks: exactly 3 objects in this order. Each summary is 1-3 sentences, no markdown, and must cite observed evidence. If evidence is missing, say so and deduct.
  - Check 1 artifact_analysis: README quality, commit history, repo age, languages, live/docs URLs, and whether artifacts support resume claims. Treat README as a claim sheet, not as a substitute for files.
  - Check 2 architecture_review: folder/module structure from the file tree or technical-breakdown architecture and whether the candidate shows real system design, not a template.
  - Check 3 api_resiliency: API design, data handling, error handling, tests, and production standards. Pass/fail tests, CI, and error handling only from filesystem paths. If those path lists are empty, say they are missing.
- No markdown, no extra keys. Never use the banned buzzwords above.`;

const AUDIT_CHECK_SCHEMA = {
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

const AUDIT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    score: {
      type: Type.INTEGER,
      description:
        "Overall hiring readiness score from 0 to 100 based on code artifacts. Do not lower the score for a missing resume. Must already apply file-system caps: max 60 if any core artifact is missing, max 50 if two or more are missing or the file tree was not inspected, and above 80 only with file-system proof of tests, CI, and error handling.",
    },
    strengths: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    redFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Code and artifact flaws only. Do not include a missing resume as a red flag.",
    },
    recommendations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    checks: {
      type: Type.ARRAY,
      description:
        "Exactly three artifact checks: Artifact Analysis, Architecture Review, and API & Data Resiliency.",
      items: AUDIT_CHECK_SCHEMA,
    },
  },
  required: ["score", "strengths", "redFlags", "recommendations", "checks"],
};

const MODEL_CANDIDATES = [
  "gemini-1.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-3.6-flash",
] as const;

function clampScore(value: unknown): number {
  return clampScore0to100(value, 0);
}

function normalizeStringArray(value: unknown, maxItems = 6): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function isMissingResumeFlag(text: string): boolean {
  const value = text.trim();
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

function optionalFilesystem(value: unknown): RepoFilesystemEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return parseRepoFilesystemEvidence(value);
}

function attachAuditEvidence(
  result: AuditResult,
  filesystem: RepoFilesystemEvidence | null,
  commitDates: string[]
): AuditResult {
  return {
    ...result,
    filesystem,
    commitDates: normalizeCommitDates(commitDates),
  };
}

function commitDatesFromArtifacts(
  githubArtifacts: GitHubArtifactAudit | null
): string[] {
  const artifacts = githubArtifacts?.artifacts ?? [];
  const filesystem = strongestFilesystemEvidence(artifacts);
  const primary =
    artifacts.find((artifact) => artifact.filesystem === filesystem) ??
    artifacts[0];

  return normalizeCommitDates(primary?.commit_dates);
}

function normalizeAuditResult(raw: unknown): AuditResult {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const recommendations = normalizeStringArray(record.recommendations, 3);
  const redFlagsRaw = normalizeStringArray(record.redFlags, 5);
  const redFlags = redFlagsRaw.filter((flag) => !isMissingResumeFlag(flag));
  const strippedResumeFlags = redFlagsRaw.length - redFlags.length;
  const score =
    strippedResumeFlags > 0
      ? clampScore(
          clampScore(record.score) + Math.min(12, strippedResumeFlags * 6)
        )
      : clampScore(record.score);

  return {
    score,
    strengths: normalizeStringArray(record.strengths, 5),
    redFlags,
    recommendations:
      recommendations.length >= 3
        ? recommendations.slice(0, 3)
        : [
            ...recommendations,
            "Add a public GitHub repo with README, architecture notes, and recent commits.",
            "Add file-system proof of tests, CI workflows, and error handling.",
            "Align project stack keywords with the target role in your headline and bio.",
          ].slice(0, 3),
    checks: normalizeAuditChecks(record.checks),
    scoreCap:
      parseScoreCapAudit(record.scoreCap) ?? emptyScoreCapAudit(score),
    metrics: emptyProductionAuditMetrics(),
    filesystem: optionalFilesystem(record.filesystem),
    commitDates: normalizeCommitDates(record.commitDates ?? record.commit_dates),
  };
}

function isValidRequestBody(body: AuditRequestBody): boolean {
  return (
    hasUsableGitHubAuditTarget(body.githubUrl) ||
    hasUsableExternalProjects(body.externalProjects)
  );
}

function hasPublicGitHubLink(githubUrl: string | undefined, workIsPrivate: boolean): boolean {
  if (workIsPrivate) {
    return false;
  }

  return hasUsableGitHubAuditTarget(githubUrl);
}

function formString(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === "string" ? value : undefined;
}

function parseJsonValue(value: string | undefined): unknown {
  if (!value?.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeAuditRequestBody(body: AuditRequestBody): AuditRequestBody {
  return {
    targetRole: body.targetRole,
    githubUrl: body.githubUrl,
    resumeSummary: body.resumeSummary,
    compensationLevel: body.compensationLevel,
    workIsPrivate: parseWorkIsPrivate(body.workIsPrivate),
    externalProjects: normalizeExternalProjects(body.externalProjects),
  };
}

async function readAuditRequest(request: Request): Promise<
  | { ok: true; body: AuditRequestBody; resumeFile: File | null }
  | { ok: false }
> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await request.formData();
      const resumeValue = form.get("resumeFile") ?? form.get("file");
      return {
        ok: true,
        body: {
          targetRole: formString(form, "targetRole"),
          githubUrl: formString(form, "githubUrl"),
          resumeSummary: formString(form, "resumeSummary"),
          compensationLevel: formString(form, "compensationLevel"),
          workIsPrivate: parseWorkIsPrivate(formString(form, "workIsPrivate")),
          externalProjects: normalizeExternalProjects(
            parseJsonValue(formString(form, "externalProjects"))
          ),
        },
        resumeFile:
          resumeValue instanceof File && resumeValue.size > 0
            ? resumeValue
            : null,
      };
    } catch {
      return { ok: false };
    }
  }

  try {
    const json = (await request.json()) as AuditRequestBody;
    if (!json || typeof json !== "object") {
      return { ok: false };
    }
    return { ok: true, body: normalizeAuditRequestBody(json), resumeFile: null };
  } catch {
    return { ok: false };
  }
}

function buildFallbackAudit(
  body: AuditRequestBody,
  githubArtifacts: GitHubArtifactAudit | null,
  externalProjects: ExternalProjectRecord[],
  usedExternalFallback: boolean
): AuditResult {
  const hasGithub = githubArtifactAuditSucceeded(githubArtifacts);
  const hasExternal = hasUsableExternalProjects(externalProjects);
  const hasResume = !!body.resumeSummary?.trim();
  const role = body.targetRole?.trim() || "your target role";
  const level = body.compensationLevel?.trim() || "Mid";

  let score = 0;
  const strengths: string[] = [];
  const redFlags: string[] = [];
  const recommendations: string[] = [];

  if (hasGithub && !usedExternalFallback) {
    score += 75;
    const artifact = githubArtifacts?.artifacts[0];
    strengths.push(
      artifact
        ? `GitHub artifacts sampled from ${artifact.owner}/${artifact.repo} (${artifact.language ?? "unknown language"}, ${artifact.commit_count_sampled} recent commits).`
        : `GitHub URL supplied — reviewers can trace repository activity for ${role}.`
    );
  } else if (hasExternal) {
    score += 75;
    const primary = externalProjects.find(
      (project) => project.project_title.trim() && project.description.trim()
    ) ?? externalProjects[0];
    strengths.push(
      primary
        ? `External project "${primary.project_title}" was reviewed from its technical breakdown${primary.project_url ? ` and live/docs URL (${primary.project_url})` : ""}.`
        : "Submitted external project artifacts are available for proof-of-work review."
    );
  } else {
    redFlags.push(
      "Missing GitHub profile or repository URL limits artifact verification."
    );
  }

  if (hasGithub || hasExternal) {
    score += 10;
    strengths.push(
      hasResume
        ? hasExternal && usedExternalFallback
          ? "Resume claims can be cross-referenced against submitted project write-ups and live/docs links."
          : "Resume and GitHub artifacts can be cross-referenced for claim verification."
        : hasExternal && usedExternalFallback
          ? "Project write-ups and live/docs links are available for proof-of-work review."
          : "Repository file-tree and commit artifacts are the basis of this score."
    );
  }

  if (hasResume) {
    strengths.push(
      "Resume text was parsed and can be checked against repository claims."
    );
  }

  if (body.targetRole?.trim()) {
    score += 15;
    strengths.push(`Target role "${role}" gives reviewers a clear evaluation lens.`);
  }

  recommendations.push(
    usedExternalFallback
      ? `Tie each project write-up to ${level}-level ${role} work: APIs, data model, ownership, and production constraints.`
      : `Pin 1-2 production repos that map directly to ${level}-level ${role} expectations.`,
    hasResume
      ? "Rewrite top resume bullets with metrics, stack tags, and links to live demos or PRs."
      : "Add tests, CI workflows, and explicit error-handling files so the file tree can support a higher score.",
    usedExternalFallback
      ? "Add architecture notes, error handling, and test strategy to each technical breakdown so reviewers can score production standards."
      : "Add a concise README per repo covering architecture, your contributions, and setup steps."
  );

  if (strengths.length === 0) {
    strengths.push("Profile inputs give a baseline starting point for a credibility audit.");
  }

  const artifact = githubArtifacts?.artifacts[0];
  const filesystem = strongestFilesystemEvidence(githubArtifacts?.artifacts ?? []);
  const primaryProject = externalProjects[0];
  const checks = CANONICAL_AUDIT_CHECKS.map((canonical) => {
    if (canonical.id === "artifact_analysis") {
      return {
        ...canonical,
        summary:
          usedExternalFallback && primaryProject
            ? `Reviewed external project "${primaryProject.project_title}"${primaryProject.project_url ? ` at ${primaryProject.project_url}` : ""}. ${primaryProject.description ? "The technical breakdown is a write-up, not a file tree, so tests, CI, and error handling were not verified as code artifacts." : "The write-up was thin, so production claims still need more concrete evidence."}`
            : artifact
            ? `Sampled ${artifact.owner}/${artifact.repo} (${artifact.language ?? "unknown language"}, ${artifact.commit_count_sampled} recent commits, ${filesystem?.file_count ?? 0} inspected files). README and commit history ${artifact.readme_excerpt ? "are present" : "are limited"}; file-tree proof of tests/CI/error handling is ${filesystem?.inspected ? "what the score is based on" : "missing"}.`
            : hasGithub
              ? `A GitHub URL was supplied for ${role}, but repository artifacts were too thin to verify README quality, commit history, or a file tree.`
              : "No GitHub artifacts were available to verify README quality, commit history, or language signals.",
      };
    }

    if (canonical.id === "architecture_review") {
      return {
        ...canonical,
        summary:
          usedExternalFallback && primaryProject?.description
            ? `Architecture was scored from the technical breakdown for "${primaryProject.project_title}". Module ownership and system boundaries still need file-system proof for ${level}-level ${role} work.`
            : filesystem?.sample_paths.length
            ? `File tree from ${artifact?.owner}/${artifact?.repo} includes ${filesystem.sample_paths.slice(0, 4).join(", ")}. Folder-level architecture still needs a clearer ownership and module map for ${level}-level ${role} work.`
            : artifact?.readme_excerpt
            ? `README excerpt from ${artifact.owner}/${artifact.repo} was reviewed as a claim sheet only. No file-tree architecture proof was available for ${level}-level ${role} work.`
            : "Architecture signals were limited. No documented module structure or system-design notes were available from the provided artifacts.",
      };
    }

    return {
      ...canonical,
      summary:
        usedExternalFallback && primaryProject?.description
          ? `API and data-handling claims were taken from the submitted technical breakdown for "${primaryProject.project_title}". Error handling, persistence, and tests still need file-system proof and cannot be credited from prose.`
          : filesystem?.inspected
          ? `File-tree inspection found tests=${filesystem.test_paths.length > 0}, CI=${filesystem.ci_workflow_paths.length > 0}, error handling=${filesystem.error_handling_paths.length > 0}. Missing core files are not waived by README language.`
          : "API and data-resiliency evidence was not confirmed. Error handling, tests, and CI could not be verified from a repository file tree.",
    };
  });

  return normalizeAuditResult({
    score,
    strengths,
    redFlags,
    recommendations,
    checks,
  });
}

async function generateGeminiAudit(
  body: AuditRequestBody,
  githubArtifacts: GitHubArtifactAudit | null,
  externalProjects: ExternalProjectRecord[],
  usedExternalFallback: boolean
): Promise<AuditResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const githubUrl = body.githubUrl?.trim() ?? "";
  const githubUnavailableReason = usedExternalFallback
    ? body.workIsPrivate
      ? "private_or_enterprise"
      : githubUrl
        ? "ghost_or_unreadable_repository"
        : "not_provided"
    : null;

  const filesystemEvidence = usedExternalFallback
    ? null
    : strongestFilesystemEvidence(githubArtifacts?.artifacts ?? []);
  const scorePolicy = buildFilesystemScorePolicy(filesystemEvidence);

  const userPrompt = JSON.stringify({
    targetRole: body.targetRole?.trim() ?? "",
    githubUrl,
    resumeText: (body.resumeSummary ?? "").slice(0, RESUME_TEXT_LIMIT),
    compensationLevel: body.compensationLevel?.trim() ?? "Mid",
    workIsPrivate: Boolean(body.workIsPrivate),
    usedExternalFallback,
    auditMode: usedExternalFallback
      ? githubArtifactAuditSucceeded(githubArtifacts)
        ? "hybrid"
        : "external_projects"
      : "github",
    githubUnavailableReason,
    scorePolicy,
    codeFirst: true,
    resumeOptional: true,
    githubProfile: usedExternalFallback ? null : githubArtifacts?.profile ?? null,
    githubArtifacts: usedExternalFallback
      ? []
      : (githubArtifacts?.artifacts ?? []).map((artifact) => ({
          repo_url: artifact.repo_url,
          owner: artifact.owner,
          repo: artifact.repo,
          stars: artifact.stars,
          forks: artifact.forks,
          created_at: artifact.created_at,
          language: artifact.language,
          commit_count_sampled: artifact.commit_count_sampled,
          commit_dates: artifact.commit_dates,
          readme_excerpt: artifact.readme_excerpt,
          filesystem: compactFilesystemForPrompt(artifact.filesystem),
        })),
    githubFetchWarnings: usedExternalFallback
      ? []
      : githubArtifacts?.fetch_warnings ?? [],
    externalProjects: externalProjects.map((project) => ({
      project_title: project.project_title,
      project_url: project.project_url,
      description: project.description.slice(0, 4000),
    })),
  });

  let lastError: unknown;

  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: AUDIT_RESPONSE_SCHEMA,
          temperature: 0,
        },
      });

      const text = response.text?.trim();

      if (!text) {
        throw new Error(`Gemini (${model}) returned an empty response.`);
      }

      return normalizeAuditResult(JSON.parse(text));
    } catch (error) {
      lastError = error;
      console.error(`Gemini audit failed for model ${model}:`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Gemini models failed.");
}

async function resolveAuditAccess(): Promise<
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      user: { id: string } | null;
      usage: DailyScanUsage;
    }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: true,
      supabase,
      user: null,
      usage: resolveDailyScanUsage(0, null),
    };
  }

  const { usage, error } = await loadDailyScanUsage(supabase, user.id);

  if (error) {
    console.error("[audit] failed to load daily scan usage:", error);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Could not verify daily scan limit." },
        { status: 500 }
      ),
    };
  }

  return { ok: true, supabase, user, usage };
}

async function loadStoredExternalProjects(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<ExternalProjectRecord[]> {
  const { data, error } = await supabase
    .from("external_projects")
    .select("id, project_title, project_url, description, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[audit] failed to load external_projects:", error);
    return [];
  }

  return normalizeExternalProjects(data);
}

async function persistOwnIntegrityAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  score: number,
  artifacts: GitHubArtifactAudit | null,
  externalProjects: ExternalProjectRecord[],
  usedExternalFallback: boolean,
  scoreCap?: ScoreCapAudit | null,
  metrics?: ProductionAuditMetrics | null
): Promise<void> {
  const primary = artifacts?.artifacts.find((artifact) =>
    githubAuditHasFetchedArtifacts(artifact)
  );
  const hasExternal = hasUsableExternalProjects(externalProjects);

  if (!primary && !(usedExternalFallback && hasExternal)) {
    return;
  }

  const { data: existingRows, error: loadError } = await supabase
    .from("profiles")
    .select("id, audit_data")
    .or(`id.eq.${userId},user_id.eq.${userId}`)
    .limit(1);

  if (loadError) {
    console.error("[audit] failed to load profile for integrity persist:", loadError);
    return;
  }

  const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;

  const existingAudit =
    existing?.audit_data &&
    typeof existing.audit_data === "object" &&
    !Array.isArray(existing.audit_data)
      ? (existing.audit_data as Record<string, unknown>)
      : null;

  if (Array.isArray(existingAudit?.interview_questions)) {
    return;
  }

  const source = usedExternalFallback
    ? primary
      ? "hybrid_artifact_audit"
      : "external_projects_audit"
    : "github_integrity_audit";

  const integrityScore = Math.max(1, clampScore0to100(score));
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      integrity_score: integrityScore,
      audit_data: {
        integrity_score: clampScore0to100(score),
        scoreCap: scoreCap ?? emptyScoreCapAudit(score),
        metrics: metrics ?? emptyProductionAuditMetrics(),
        github_audit: usedExternalFallback ? primary ?? null : primary,
        external_projects: hasExternal
          ? externalProjects.map((project) => ({
              project_title: project.project_title,
              project_url: project.project_url,
              description: project.description,
            }))
          : [],
        source,
      },
    })
    .eq("id", existing?.id ?? userId);

  if (updateError) {
    console.error("[audit] failed to persist integrity audit:", updateError);
  }
}

export async function GET() {
  const access = await resolveAuditAccess();

  if (!access.ok) {
    return access.response;
  }

  return NextResponse.json(access.usage);
}

export async function POST(request: Request) {
  const access = await resolveAuditAccess();

  if (!access.ok) {
    return access.response;
  }

  if (!access.user) {
    const guestLimit = consumeRateLimit(
      `audit-guest:${getRequestIp(request)}`,
      8,
      60 * 60 * 1000
    );
    if (!guestLimit.ok) {
      return tooManyRequestsResponse(guestLimit.retryAfterSec);
    }
  }

  if (access.user && access.usage.limit_reached) {
    return NextResponse.json(
      { error: DAILY_LIMIT_API_MESSAGE, ...access.usage },
      { status: 429 }
    );
  }

  const parsed = await readAuditRequest(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const payload: AuditRequestBody = { ...parsed.body };

  let storedProjects: ExternalProjectRecord[] = [];
  if (access.user) {
    storedProjects = await loadStoredExternalProjects(
      access.supabase,
      access.user.id
    );
  }

  payload.externalProjects = mergeExternalProjects(
    storedProjects,
    payload.externalProjects
  );

  const githubField = payload.githubUrl?.trim() ?? "";
  const githubMissing =
    !githubField ||
    isGitHubPlaceholderInput(githubField) ||
    !hasUsableGitHubAuditTarget(githubField);

  if (githubMissing && !hasUsableExternalProjects(payload.externalProjects)) {
    return NextResponse.json(
      { error: AUDIT_MISSING_GITHUB_OR_ARTIFACT_MESSAGE },
      { status: 400 }
    );
  }

  if (parsed.resumeFile) {
    try {
      payload.resumeSummary = await extractResumeTextFromFile(parsed.resumeFile);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not parse the uploaded resume.",
        },
        { status: 422 }
      );
    }
  }

  if (access.user && (!payload.resumeSummary?.trim() || !payload.githubUrl?.trim())) {
    const { data } = await access.supabase
      .from("profiles")
      .select("resume_text, portfolio_url")
      .eq("id", access.user.id)
      .maybeSingle();

    if (!payload.resumeSummary?.trim() && data?.resume_text?.trim()) {
      payload.resumeSummary = data.resume_text;
    }

    if (
      !payload.workIsPrivate &&
      !hasUsableGitHubAuditTarget(payload.githubUrl) &&
      data?.portfolio_url?.trim()
    ) {
      payload.githubUrl = data.portfolio_url;
    }
  }

  if (!isValidRequestBody(payload)) {
    return NextResponse.json(
      { error: AUDIT_MISSING_GITHUB_OR_ARTIFACT_MESSAGE },
      { status: 400 }
    );
  }

  const workIsPrivate = Boolean(payload.workIsPrivate);
  const publicGithub = hasPublicGitHubLink(payload.githubUrl, workIsPrivate);
  const githubFetchUrl = publicGithub
    ? normalizeGitHubAuditTarget(payload.githubUrl)
    : "";

  let githubArtifacts: GitHubArtifactAudit | null = null;
  if (githubFetchUrl) {
    try {
      githubArtifacts = await fetchGitHubProfileArtifacts(githubFetchUrl);
    } catch (error) {
      console.error("[audit] GitHub artifact fetch failed:", error);
    }
  }

  const inaccessibleRepo =
    !workIsPrivate &&
    Boolean(githubFetchUrl) &&
    (githubArtifacts === null || githubAuditLooksInaccessible(githubArtifacts));

  if (inaccessibleRepo) {
    const usage = access.user
      ? await incrementDailyScanUsage(
          access.supabase,
          access.user.id,
          access.usage
        )
      : access.usage;

    return NextResponse.json({
      isPrivateOrNotFound: true,
      repoUrl: githubFetchUrl,
      inaccessibleRepo: true,
      ...usage,
    });
  }

  const usedExternalFallback = shouldUseExternalProjectFallback({
    workIsPrivate,
    githubUrl: publicGithub ? payload.githubUrl?.trim() ?? "" : "",
    githubAuditSucceeded: githubArtifactAuditSucceeded(githubArtifacts),
    hasExternalProjects: hasUsableExternalProjects(payload.externalProjects),
  });

  let result: AuditResult;

  try {
    result = await generateGeminiAudit(
      payload,
      githubArtifacts,
      payload.externalProjects ?? [],
      usedExternalFallback
    );
  } catch (error) {
    console.error("Gemini audit API failed, using fallback:", error);
    result = buildFallbackAudit(
      payload,
      githubArtifacts,
      payload.externalProjects ?? [],
      usedExternalFallback
    );
  }

  const filesystem = strongestFilesystemEvidence(
    githubArtifacts?.artifacts ?? []
  );
  const metrics = computeProductionAuditMetrics(
    usedExternalFallback ? null : filesystem
  );
  result = attachAuditEvidence(
    applyFilesystemScoreCap(result, filesystem),
    filesystem,
    commitDatesFromArtifacts(githubArtifacts)
  );
  result = { ...result, metrics };

  // When the file tree was inspected, blend the qualitative score with the
  // deterministic production scorecard so CI/tests/error-boundary findings
  // move the headline number — not only the cap.
  if (metrics.evidence.inspected) {
    const blended = clampScore0to100(
      Math.round(result.score * 0.45 + metrics.productionScore * 0.55)
    );
    result = applyFilesystemScoreCap(
      { ...result, score: blended },
      filesystem
    );
    result = { ...result, metrics };
  }

  const usage = access.user
    ? await incrementDailyScanUsage(
        access.supabase,
        access.user.id,
        access.usage
      )
    : access.usage;

  if (
    access.user &&
    (githubArtifactAuditSucceeded(githubArtifacts) ||
      (usedExternalFallback &&
        hasUsableExternalProjects(payload.externalProjects)))
  ) {
    try {
      await persistOwnIntegrityAudit(
        access.supabase,
        access.user.id,
        result.score,
        githubArtifacts,
        payload.externalProjects ?? [],
        usedExternalFallback,
        result.scoreCap,
        result.metrics
      );
    } catch (error) {
      console.error("[audit] persist integrity audit threw:", error);
    }

    try {
      const claim = buildProductionAuditClaim({
        score: result.score,
        githubUrl: workIsPrivate
          ? PRIVATE_AUDITED_REPO_LABEL
          : payload.githubUrl?.trim() ||
            githubArtifacts?.source_url ||
            githubArtifacts?.artifacts[0]?.repo_url ||
            PRIVATE_AUDITED_REPO_LABEL,
        filesystem,
        scoreCap: result.scoreCap,
        isPubliclyVisible: workIsPrivate ? false : undefined,
      });
      await persistProfileProductionAudit(
        access.supabase,
        access.user.id,
        claim,
        workIsPrivate ? { isPubliclyVisible: false } : undefined
      );
    } catch (error) {
      console.error("[audit] persist production audit threw:", error);
    }
  }

  return NextResponse.json({ ...result, ...usage });
}
