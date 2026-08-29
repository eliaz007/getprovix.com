import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { requireAiApiUser } from "@/lib/api-auth";
import { createClient } from "@/utils/supabase/server";

type CandidatePayload = {
  name?: string;
  title?: string;
  bio?: string;
  skills?: string[] | string;
  degree?: string;
  experience?: string;
  projects?: string[] | string;
  github_url?: string;
  github?: string;
};

type JobPayload = {
  title?: string;
  company?: string;
  tags?: string[] | string;
  location?: string;
  description?: string;
};

export type GitHubCommitSummary = {
  sha: string;
  date: string;
  message: string;
};

export type GitHubAuditContext = {
  repo_url: string;
  owner: string;
  repo: string;
  stars: number | null;
  forks: number | null;
  created_at: string | null;
  language: string | null;
  commit_count_sampled: number;
  commit_dates: string[];
  readme_excerpt: string | null;
  fetch_warnings: string[];
};

export type InterviewQuestion = {
  question: string;
  category: string;
  what_to_listen_for: string;
};

export type ScreenResult = {
  integrity_score: number;
  timeline_flags: string[];
  artifact_analysis: string;
  technical_depth_summary: string;
  interview_questions: InterviewQuestion[];
  github_audit?: GitHubAuditContext | null;
};

const SYSTEM_PROMPT = `You are a rigorous Technical & Academic Auditor for Provix employer screening.

You receive:
- Candidate profile claims (skills, bio, degree, experience level, projects)
- Target job requirements
- Optional live GitHub repository audit data (stars, forks, creation date, language, recent commits, README excerpt)

Perform Check 1 (GitHub artifact audit) and Check 3 (chronological timeline conflict check):
- Cross-check claimed skills against actual repository evidence (e.g., flag claiming full architecture on a repo with only 1 commit or no README).
- Evaluate timeline plausibility (flag years of experience exceeding a framework's release date, overlapping impossible dates, or bio claims not supported by commit history).
- Be skeptical but fair; cite concrete evidence from the provided repo metadata when available.

Return strict JSON only in this exact structure:
{
  "integrity_score": number (integer 1-100),
  "timeline_flags": ["flag1", "flag2"],
  "artifact_analysis": "Concise paragraph on repository/proof-of-work authenticity.",
  "technical_depth_summary": "Concise paragraph on demonstrated technical depth vs role requirements.",
  "interview_questions": [
    {
      "question": "Tailored interview question",
      "category": "Architecture / Process | Metric Verification | Technical Depth",
      "what_to_listen_for": "Concise coaching tip on strong vs weak answers."
    }
  ]
}

Also generate an Employer Interview Cheat Sheet:
- Provide exactly 3 tailored, role-specific interview questions grounded in the candidate's verified skills, artifacts, GitHub audit (if any), and stated claims.
- Each question must include a category badge label and a concise what_to_listen_for tip for hiring managers.

Rules:
- integrity_score: 1-100 integer; lower when red flags dominate, higher when claims align with artifacts.
- timeline_flags: array of specific red-flag strings; empty array if none.
- artifact_analysis and technical_depth_summary: single concise sentences or short paragraphs, no markdown.
- interview_questions: exactly 3 objects; categories should vary (e.g., Architecture / Process, Metric Verification, Technical Depth).
- Do not include extra keys or markdown fences.`;

const SCREEN_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    integrity_score: {
      type: Type.INTEGER,
      description: "Integrity score from 1 to 100.",
    },
    timeline_flags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
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
  },
  required: [
    "integrity_score",
    "timeline_flags",
    "artifact_analysis",
    "technical_depth_summary",
    "interview_questions",
  ],
};

const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-1.5-flash",
  "gemini-3.6-flash",
  "gemini-2.0-flash",
] as const;

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

function clampIntegrityScore(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return 65;
  }

  return Math.min(100, Math.max(1, Math.round(numeric)));
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

  const timeline_flags = normalizeStringArray(record.timeline_flags, 8);

  const artifact_analysis =
    typeof record.artifact_analysis === "string" &&
    record.artifact_analysis.trim()
      ? record.artifact_analysis.trim()
      : "Insufficient artifact data to fully validate proof-of-work claims.";

  const technical_depth_summary =
    typeof record.technical_depth_summary === "string" &&
    record.technical_depth_summary.trim()
      ? record.technical_depth_summary.trim()
      : "Technical depth appears partially aligned with stated skills.";

  let interview_questions = normalizeInterviewQuestions(
    record.interview_questions
  );
  while (interview_questions.length < 3) {
    const defaults = buildDefaultInterviewQuestions(candidate, job);
    interview_questions.push(defaults[interview_questions.length]);
  }

  return {
    integrity_score: clampIntegrityScore(record.integrity_score),
    timeline_flags,
    artifact_analysis,
    technical_depth_summary,
    interview_questions: interview_questions.slice(0, 3),
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

function parseGitHubRepoUrl(
  url: string
): { owner: string; repo: string } | null {
  try {
    const normalized = url
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "");
    const match = normalized.match(/github\.com\/([^/]+)\/([^/?#]+)/i);
    if (!match) {
      return null;
    }

    const owner = match[1];
    const repo = match[2].replace(/\.git$/i, "");
    if (!owner || !repo || owner === "orgs" || owner === "organizations") {
      return null;
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Provix-Screening/1.0",
  };

  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function fetchGitHubAudit(
  repoUrl: string
): Promise<GitHubAuditContext | null> {
  const parsed = parseGitHubRepoUrl(repoUrl);
  if (!parsed) {
    return null;
  }

  const { owner, repo } = parsed;
  const warnings: string[] = [];
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  let stars: number | null = null;
  let forks: number | null = null;
  let created_at: string | null = null;
  let language: string | null = null;

  try {
    const repoResponse = await fetch(base, {
      headers: githubHeaders(),
      next: { revalidate: 300 },
    });

    if (repoResponse.ok) {
      const repoData = (await repoResponse.json()) as {
        stargazers_count?: number;
        forks_count?: number;
        created_at?: string;
        language?: string | null;
      };
      stars = repoData.stargazers_count ?? null;
      forks = repoData.forks_count ?? null;
      created_at = repoData.created_at ?? null;
      language = repoData.language ?? null;
    } else {
      warnings.push(
        `Repo metadata request failed (${repoResponse.status}) for ${owner}/${repo}.`
      );
    }
  } catch (error) {
    console.error("[screen] GitHub repo fetch failed:", error);
    warnings.push("Could not fetch GitHub repository metadata.");
  }

  const commitSummaries: GitHubCommitSummary[] = [];

  try {
    const commitsResponse = await fetch(
      `${base}/commits?per_page=10`,
      {
        headers: githubHeaders(),
        next: { revalidate: 300 },
      }
    );

    if (commitsResponse.ok) {
      const commitsData = (await commitsResponse.json()) as Array<{
        sha?: string;
        commit?: { message?: string; author?: { date?: string } };
      }>;

      for (const entry of commitsData) {
        commitSummaries.push({
          sha: entry.sha?.slice(0, 7) ?? "unknown",
          date: entry.commit?.author?.date ?? "unknown",
          message: (entry.commit?.message ?? "").split("\n")[0].slice(0, 120),
        });
      }
    } else {
      warnings.push(
        `Commit history request failed (${commitsResponse.status}) for ${owner}/${repo}.`
      );
    }
  } catch (error) {
    console.error("[screen] GitHub commits fetch failed:", error);
    warnings.push("Could not fetch GitHub commit activity.");
  }

  let readme_excerpt: string | null = null;

  try {
    const readmeResponse = await fetch(`${base}/readme`, {
      headers: {
        ...githubHeaders(),
        Accept: "application/vnd.github.raw",
      },
      next: { revalidate: 300 },
    });

    if (readmeResponse.ok) {
      const readmeText = await readmeResponse.text();
      readme_excerpt = readmeText.slice(0, 2000);
    }
  } catch (error) {
    console.error("[screen] GitHub readme fetch failed:", error);
    warnings.push("README not available or could not be fetched.");
  }

  return {
    repo_url: repoUrl,
    owner,
    repo,
    stars,
    forks,
    created_at,
    language,
    commit_count_sampled: commitSummaries.length,
    commit_dates: commitSummaries.map((commit) => commit.date),
    readme_excerpt,
    fetch_warnings: warnings,
  };
}

function buildFallbackScreen(
  candidate: CandidatePayload,
  job: JobPayload,
  githubAudit: GitHubAuditContext | null
): ScreenResult {
  const skills = normalizeStringArray(candidate.skills, 8);
  const jobTags = normalizeStringArray(job.tags, 8);
  const overlap = jobTags.filter((tag) =>
    skills.some(
      (skill) =>
        skill.toLowerCase().includes(tag.toLowerCase()) ||
        tag.toLowerCase().includes(skill.toLowerCase())
    )
  );

  const timeline_flags: string[] = [];
  let integrity_score = 62 + overlap.length * 4;

  if (githubAudit) {
    if (githubAudit.commit_count_sampled <= 1) {
      timeline_flags.push(
        "Repository shows minimal commit history relative to claimed project ownership."
      );
      integrity_score -= 15;
    }

    if (!githubAudit.readme_excerpt) {
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
    integrity_score -= 10;
  }

  const roleLabel = job.title ?? "this role";

  return {
    integrity_score: clampIntegrityScore(integrity_score),
    timeline_flags,
    artifact_analysis: githubAudit
      ? `Fallback audit of ${githubAudit.owner}/${githubAudit.repo}: ${githubAudit.commit_count_sampled} recent commits sampled, primary language ${githubAudit.language ?? "unknown"}.`
      : "Fallback screening could not verify proof-of-work artifacts against a public GitHub repository.",
    technical_depth_summary: `Skill overlap with ${roleLabel}: ${overlap.join(", ") || skills.slice(0, 2).join(", ") || "limited explicit matches"}.`,
    interview_questions: buildDefaultInterviewQuestions(candidate, job),
    github_audit: githubAudit,
  };
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
  userId: string
): Promise<boolean> {
  if (!candidateKey?.trim()) {
    return false;
  }

  try {
    const supabase = await createClient();
    const key = candidateKey.trim();
    const payload = result as unknown as Record<string, unknown>;
    const requestedProfileId = profileId?.trim() || null;
    const ownedProfileId =
      requestedProfileId && requestedProfileId === userId
        ? requestedProfileId
        : null;

    const { error: screeningError } = await supabase
      .from("candidate_screenings")
      .upsert(
        {
          candidate_key: key,
          profile_id: ownedProfileId,
          integrity_score: result.integrity_score,
          audit_data: payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "candidate_key" }
      );

    if (screeningError) {
      console.error("[screen] candidate_screenings upsert failed:", screeningError);
    }

    if (ownedProfileId) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          integrity_score: result.integrity_score,
          audit_data: payload,
        })
        .eq("id", userId);

      if (profileError) {
        console.error("[screen] profiles audit update failed:", profileError);
      }
    }

    return !screeningError;
  } catch (error) {
    console.error("[screen] persistScreeningResult threw:", error);
    return false;
  }
}

async function generateGeminiScreen(
  candidate: CandidatePayload,
  job: JobPayload,
  githubAudit: GitHubAuditContext | null
): Promise<ScreenResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const userPrompt = JSON.stringify(
    {
      candidate: {
        name: candidate.name ?? "",
        title: candidate.title ?? "",
        skills: normalizeStringArray(candidate.skills, 12),
        degree: candidate.degree ?? "",
        bio: (candidate.bio ?? "").slice(0, 600),
        experience: candidate.experience ?? "",
        projects: normalizeStringArray(candidate.projects, 6),
        github_url: resolveCandidateGitHubUrl(candidate),
      },
      job: {
        title: job.title ?? "",
        company: job.company ?? "",
        tags: normalizeStringArray(job.tags, 12),
        location: job.location ?? "",
        description: (job.description ?? "").slice(0, 400),
      },
      github_audit: githubAudit,
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
          temperature: 0.2,
        },
      });

      const text = response.text?.trim();

      if (!text) {
        throw new Error(`Gemini (${model}) returned an empty response.`);
      }

      const normalized = normalizeScreenResult(JSON.parse(text), candidate, job);
      return {
        ...normalized,
        github_audit: githubAudit,
      };
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

  const { candidate, job, candidate_key, profile_id } = record;

  const githubUrl = resolveCandidateGitHubUrl(candidate);
  let githubAudit: GitHubAuditContext | null = null;

  if (githubUrl) {
    try {
      githubAudit = await fetchGitHubAudit(githubUrl);
    } catch (error) {
      console.error("[screen] GitHub audit failed:", error);
    }
  }

  try {
    const result = await generateGeminiScreen(candidate, job, githubAudit);
    const persisted = await persistScreeningResult(
      candidate_key,
      profile_id,
      result,
      access.user.id
    );
    return NextResponse.json({ ...result, persisted });
  } catch (error) {
    console.error("Gemini screen API failed, using fallback:", error);
    const fallback = buildFallbackScreen(candidate, job, githubAudit);
    const persisted = await persistScreeningResult(
      candidate_key,
      profile_id,
      fallback,
      access.user.id
    );
    return NextResponse.json({ ...fallback, persisted });
  }
}
