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
  fetchGitHubProfileArtifacts,
  githubArtifactAuditSucceeded,
  githubAuditHasFetchedArtifacts,
  type GitHubArtifactAudit,
} from "@/lib/github-audit";
import {
  consumeRateLimit,
  getRequestIp,
  tooManyRequestsResponse,
} from "@/lib/ip-rate-limit";
import { extractResumeTextFromFile } from "@/lib/parse-resume";
import { RESUME_TEXT_LIMIT } from "@/lib/resume-file";
import { clampScore0to100 } from "@/lib/score-scale";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

export type AuditRequestBody = {
  targetRole?: string;
  githubUrl?: string;
  resumeSummary?: string;
  compensationLevel?: string;
};

export type { AuditCheck };

export type AuditResult = {
  score: number;
  strengths: string[];
  redFlags: string[];
  recommendations: string[];
  checks: AuditCheck[];
};

const SYSTEM_PROMPT = `You are Provix's GitHub & Resume Credibility Auditor.

Evaluate whether a candidate's stated role, GitHub presence, live repository artifacts, and resume text demonstrate credible proof-of-work for founders and hiring managers.

Return strict JSON only:
{
  "score": number (integer 0-100, hiring readiness),
  "strengths": ["verified strength with evidence", "..."],
  "redFlags": ["missing proof or credibility gap", "..."],
  "recommendations": ["specific actionable fix", "...", "..."],
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

Rules:
- score: 0-100 integer reflecting overall hiring readiness for the target role and level. 0 is the absolute minimum, 100 is the maximum.
- strengths: 3-5 bullets citing concrete signals from GitHub artifacts and/or resume text when provided.
- redFlags: 2-5 bullets flagging gaps, vague claims, missing artifacts, or timeline inconsistencies.
- recommendations: exactly 3 specific, actionable steps to stand out to founders (not generic advice).
- checks: exactly 3 objects in this order. Each summary is 1-3 sentences, no markdown, citing evidence from GitHub artifacts and/or resume text when available.
  - Check 1 artifact_analysis: README quality, commit history, repo age, languages, and whether artifacts support resume claims.
  - Check 2 architecture_review: system design signals, folder/module structure, and whether the candidate demonstrates architectural thinking.
  - Check 3 api_resiliency: API design, data handling, error handling, and production resiliency signals. If evidence is thin, say so explicitly.
- Cross-reference resume claims (skills, titles, employers, projects, dates, stack) against GitHub profile metadata and code artifacts (languages, READMEs, commit activity, repo age). Flag resume claims that are not supported by GitHub evidence, and GitHub activity that contradicts resume seniority or dates.
- Be skeptical but fair. If GitHub URL is missing, note that in redFlags and in the relevant check summaries. If resume is thin or missing, score accordingly.
- No markdown, no extra keys.`;

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
      description: "Overall hiring readiness score from 0 to 100.",
    },
    strengths: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    redFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
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

function normalizeAuditResult(raw: unknown): AuditResult {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const recommendations = normalizeStringArray(record.recommendations, 3);

  return {
    score: clampScore(record.score),
    strengths: normalizeStringArray(record.strengths, 5),
    redFlags: normalizeStringArray(record.redFlags, 5),
    recommendations:
      recommendations.length >= 3
        ? recommendations.slice(0, 3)
        : [
            ...recommendations,
            "Add a public GitHub repo with README, architecture notes, and recent commits.",
            "Quantify resume bullets with metrics, scope, and verifiable links.",
            "Align project stack keywords with the target role in your headline and bio.",
          ].slice(0, 3),
    checks: normalizeAuditChecks(record.checks),
  };
}

function isValidRequestBody(body: AuditRequestBody): boolean {
  return Boolean(
    body.targetRole?.trim() ||
      body.githubUrl?.trim() ||
      body.resumeSummary?.trim()
  );
}

function formString(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === "string" ? value : undefined;
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
    return { ok: true, body: json, resumeFile: null };
  } catch {
    return { ok: false };
  }
}

function buildFallbackAudit(
  body: AuditRequestBody,
  githubArtifacts: GitHubArtifactAudit | null
): AuditResult {
  const hasGithub =
    !!body.githubUrl?.trim() || (githubArtifacts?.artifacts.length ?? 0) > 0;
  const hasResume = !!body.resumeSummary?.trim();
  const role = body.targetRole?.trim() || "your target role";
  const level = body.compensationLevel?.trim() || "Mid";

  let score = 0;
  const strengths: string[] = [];
  const redFlags: string[] = [];
  const recommendations: string[] = [];

  if (hasResume) {
    score += 35;
    strengths.push(
      "Resume text was parsed and is available to evaluate claimed experience and scope."
    );
  } else {
    redFlags.push("No resume or experience summary provided for proof-of-work review.");
  }

  if (hasGithub) {
    score += 40;
    const artifact = githubArtifacts?.artifacts[0];
    strengths.push(
      artifact
        ? `GitHub artifacts sampled from ${artifact.owner}/${artifact.repo} (${artifact.language ?? "unknown language"}, ${artifact.commit_count_sampled} recent commits).`
        : `GitHub URL supplied — reviewers can trace repository activity for ${role}.`
    );
  } else {
    redFlags.push(
      "Missing GitHub profile or repository URL limits artifact verification."
    );
  }

  if (hasResume && hasGithub) {
    score += 10;
    strengths.push(
      "Resume and GitHub artifacts can be cross-referenced for claim verification."
    );
  }

  if (body.targetRole?.trim()) {
    score += 15;
    strengths.push(`Target role "${role}" gives reviewers a clear evaluation lens.`);
  }

  recommendations.push(
    `Pin 1-2 production repos that map directly to ${level}-level ${role} expectations.`,
    "Rewrite top resume bullets with metrics, stack tags, and links to live demos or PRs.",
    "Add a concise README per repo covering architecture, your contributions, and setup steps."
  );

  if (strengths.length === 0) {
    strengths.push("Profile inputs give a baseline starting point for a credibility audit.");
  }

  const artifact = githubArtifacts?.artifacts[0];
  const checks = CANONICAL_AUDIT_CHECKS.map((canonical) => {
    if (canonical.id === "artifact_analysis") {
      return {
        ...canonical,
        summary: artifact
          ? `Sampled ${artifact.owner}/${artifact.repo} (${artifact.language ?? "unknown language"}, ${artifact.commit_count_sampled} recent commits). README and commit history ${artifact.readme_excerpt ? "are present" : "are limited"} for claim verification.`
          : hasGithub
            ? `A GitHub URL was supplied for ${role}, but repository artifacts were too thin to verify README quality or commit history.`
            : "No GitHub artifacts were available to verify README quality, commit history, or language signals.",
      };
    }

    if (canonical.id === "architecture_review") {
      return {
        ...canonical,
        summary: artifact?.readme_excerpt
          ? `README excerpt from ${artifact.owner}/${artifact.repo} was reviewed for design notes. Folder-level architecture still needs a clearer ownership and module map for ${level}-level ${role} work.`
          : "Architecture signals were limited. No documented module structure or system-design notes were available from the provided artifacts.",
      };
    }

    return {
      ...canonical,
      summary:
        "API and data-resiliency evidence was not confirmed. Error handling, persistence, and production hardening could not be verified from the sampled artifacts.",
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
  githubArtifacts: GitHubArtifactAudit | null
): Promise<AuditResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const userPrompt = JSON.stringify({
    targetRole: body.targetRole?.trim() ?? "",
    githubUrl: body.githubUrl?.trim() ?? "",
    resumeText: (body.resumeSummary ?? "").slice(0, RESUME_TEXT_LIMIT),
    compensationLevel: body.compensationLevel?.trim() ?? "Mid",
    githubProfile: githubArtifacts?.profile ?? null,
    githubArtifacts: (githubArtifacts?.artifacts ?? []).map((artifact) => ({
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
    })),
    githubFetchWarnings: githubArtifacts?.fetch_warnings ?? [],
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
          temperature: 0.25,
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

async function persistOwnGitHubIntegrityAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  score: number,
  artifacts: GitHubArtifactAudit
): Promise<void> {
  const primary = artifacts.artifacts.find((artifact) =>
    githubAuditHasFetchedArtifacts(artifact)
  );
  if (!primary) {
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

  const integrityScore = Math.max(1, clampScore0to100(score));
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      integrity_score: integrityScore,
      audit_data: {
        integrity_score: clampScore0to100(score),
        github_audit: primary,
        source: "github_integrity_audit",
      },
    })
    .eq("id", existing?.id ?? userId);

  if (updateError) {
    console.error("[audit] failed to persist GitHub integrity audit:", updateError);
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

    if (!payload.githubUrl?.trim() && data?.portfolio_url?.trim()) {
      payload.githubUrl = data.portfolio_url;
    }
  }

  if (!isValidRequestBody(payload)) {
    return NextResponse.json(
      {
        error:
          "Provide at least a target role, GitHub URL, or resume to audit.",
      },
      { status: 400 }
    );
  }

  let githubArtifacts: GitHubArtifactAudit | null = null;
  if (payload.githubUrl?.trim()) {
    try {
      githubArtifacts = await fetchGitHubProfileArtifacts(payload.githubUrl);
    } catch (error) {
      console.error("[audit] GitHub artifact fetch failed:", error);
    }
  }

  let result: AuditResult;

  try {
    result = await generateGeminiAudit(payload, githubArtifacts);
  } catch (error) {
    console.error("Gemini audit API failed, using fallback:", error);
    result = buildFallbackAudit(payload, githubArtifacts);
  }

  const usage = access.user
    ? await incrementDailyScanUsage(
        access.supabase,
        access.user.id,
        access.usage
      )
    : access.usage;

  if (access.user && githubArtifactAuditSucceeded(githubArtifacts)) {
    try {
      await persistOwnGitHubIntegrityAudit(
        access.supabase,
        access.user.id,
        result.score,
        githubArtifacts as GitHubArtifactAudit
      );
    } catch (error) {
      console.error("[audit] persist GitHub integrity audit threw:", error);
    }
  }

  return NextResponse.json({ ...result, ...usage });
}
