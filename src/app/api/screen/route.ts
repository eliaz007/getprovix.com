import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/admin-access";
import { requireAiApiUser, rejectUnlessVerifiedEmployer } from "@/lib/api-auth";
import {
  fetchGitHubAudit,
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
import { createClient } from "@/utils/supabase/server";

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
  location?: string;
  description?: string;
};

export type { GitHubAuditContext };

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

Provix is an anonymized talent platform. The candidate's display name is a generated codename (for example "Ember Echo"), not a legal identity. GitHub handles, GitHub profile names, and resume bylines are expected to differ from that codename.

You receive:
- Candidate profile claims (codename, skills, bio, degree, experience level, projects)
- Target job requirements
- Optional live GitHub repository audit data (stars, forks, creation date, language, recent commits, README excerpt)

Perform Check 1 (GitHub artifact audit) and Check 3 (chronological timeline conflict check):
- Cross-check claimed skills against actual repository evidence (e.g., flag claiming full architecture on a repo with only 1 commit or no README).
- Evaluate timeline plausibility (flag years of experience exceeding a framework's release date, overlapping impossible dates, or bio claims not supported by commit history).
- Be skeptical but fair; cite concrete evidence from the provided repo metadata when available.
- Do not treat GitHub handle, GitHub login, or GitHub profile name vs Provix display name/codename as a red flag, identity issue, or scoring penalty. Never add a timeline_flag or lower integrity_score because those strings do not match.

Return strict JSON only in this exact structure:
{
  "integrity_score": number (integer 0-100),
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
- integrity_score: 0-100 integer; 0 is the absolute minimum, 100 is the maximum. Lower when red flags dominate, higher when claims align with artifacts. Do not deduct points for GitHub handle / display-name mismatch.
- timeline_flags: array of specific red-flag strings; empty array if none. Never include flags about GitHub handle, username, or login not matching the candidate display name or codename.
- artifact_analysis and technical_depth_summary: single concise sentences or short paragraphs, no markdown. Do not mention handle-vs-name mismatch.
- interview_questions: exactly 3 objects; categories should vary (e.g., Architecture / Process, Metric Verification, Technical Depth).
- Do not include extra keys or markdown fences.`;

const SCREEN_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    integrity_score: {
      type: Type.INTEGER,
      description: "Integrity score from 0 to 100.",
    },
    timeline_flags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Red flags from artifact or timeline review. Do not include GitHub handle vs display-name/codename mismatch.",
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

function stripGithubHandleDisplayNameFlags(flags: string[]): {
  flags: string[];
  stripped: number;
} {
  const kept = flags.filter((flag) => !isGithubHandleDisplayNameFlag(flag));
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

  const artifact_analysis = stripHandleMismatchFromProse(
    typeof record.artifact_analysis === "string" &&
      record.artifact_analysis.trim()
      ? record.artifact_analysis.trim()
      : artifactFallback,
    artifactFallback
  );

  const technical_depth_summary = stripHandleMismatchFromProse(
    typeof record.technical_depth_summary === "string" &&
      record.technical_depth_summary.trim()
      ? record.technical_depth_summary.trim()
      : depthFallback,
    depthFallback
  );

  let interview_questions = normalizeInterviewQuestions(
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
  const jobTags = normalizeStringArray(job.tags, 8);
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
    const admin = createServiceRoleClient();
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

    const { error: screeningError } = await supabase
      .from("candidate_screenings")
      .upsert(
        {
          candidate_key: key,
          profile_id: candidateProfileId,
          integrity_score: result.integrity_score,
          audit_data: payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "candidate_key" }
      );

    if (screeningError) {
      console.error("[screen] candidate_screenings upsert failed:", screeningError);
    }

    if (!candidateProfileId) {
      return !screeningError;
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
        codename: candidate.name ?? "",
        identity_context:
          "codename is an anonymized Provix alias (e.g. Ember Echo), not a legal name. Do not compare it to the GitHub handle.",
        title: candidate.title ?? "",
        skills: normalizeStringArray(candidate.skills, 12),
        degree: candidate.degree ?? "",
        university: candidate.university ?? "",
        major: candidate.major ?? "",
        gpa: candidate.gpa ?? "",
        graduation_year: candidate.graduation_year ?? "",
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
