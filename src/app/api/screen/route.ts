import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

type CandidatePayload = {
  name?: string;
  title?: string;
  bio?: string;
  skills?: string[] | string;
  degree?: string;
  experience?: string;
  projects?: string[] | string;
};

type JobPayload = {
  title?: string;
  company?: string;
  tags?: string[] | string;
  location?: string;
  description?: string;
};

export type ScreenResult = {
  strengths: string[];
  gaps: string[];
  interview_questions: string[];
};

const SYSTEM_PROMPT = `You are a senior technical recruiter. Analyze candidate fit for a job and return JSON only:
{"strengths":["…","…","…"],"gaps":["…"],"interview_questions":["…","…"]}
Rules:
- strengths: exactly 3 concise bullet-style strings
- gaps: 1-2 potential growth areas or skill gaps
- interview_questions: exactly 2 targeted technical interview questions for this candidate + role
No markdown.`;

const SCREEN_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    strengths: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    gaps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    interview_questions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ["strengths", "gaps", "interview_questions"],
};

const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
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

function normalizeScreenResult(raw: unknown): ScreenResult {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const strengths = normalizeStringArray(record.strengths, 3);
  const gaps = normalizeStringArray(record.gaps, 2);
  const interview_questions = normalizeStringArray(record.interview_questions, 2);

  while (strengths.length < 3) {
    strengths.push("Demonstrates relevant hands-on experience for the role.");
  }

  if (gaps.length === 0) {
    gaps.push("May need deeper exposure to some role-specific tooling.");
  }

  while (interview_questions.length < 2) {
    interview_questions.push(
      "Walk me through a recent project where you applied your core stack end-to-end."
    );
  }

  return {
    strengths: strengths.slice(0, 3),
    gaps: gaps.slice(0, 2),
    interview_questions: interview_questions.slice(0, 2),
  };
}

function buildFallbackScreen(
  candidate: CandidatePayload,
  job: JobPayload
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

  const roleLabel = job.title ?? "this role";
  const topSkills = overlap.length > 0 ? overlap : skills.slice(0, 2);

  return {
    strengths: [
      `Strong alignment with ${roleLabel} through ${topSkills.join(", ") || "core technical skills"}.`,
      candidate.bio?.trim()
        ? "Clear proof-of-work narrative backed by concrete project outcomes."
        : "Portfolio signals practical delivery experience beyond resume keywords.",
      `Background in ${candidate.title ?? candidate.degree ?? "relevant domains"} maps well to team expectations.`,
    ],
    gaps: [
      jobTags.length > overlap.length
        ? `Limited explicit evidence for: ${jobTags.filter((t) => !overlap.includes(t)).slice(0, 2).join(", ")}.`
        : "Could benefit from more production-scale ownership examples.",
    ],
    interview_questions: [
      `How would you apply ${topSkills[0] ?? "your primary stack"} to solve a real problem for ${roleLabel}?`,
      "Describe a project where you had to debug a critical issue under time pressure — what was your process?",
    ],
  };
}

function isValidRequestBody(
  body: unknown
): body is { candidate: CandidatePayload; job: JobPayload } {
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

async function generateGeminiScreen(
  candidate: CandidatePayload,
  job: JobPayload
): Promise<ScreenResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const userPrompt = JSON.stringify({
    candidate: {
      name: candidate.name ?? "",
      title: candidate.title ?? "",
      skills: normalizeStringArray(candidate.skills, 12),
      degree: candidate.degree ?? "",
      bio: (candidate.bio ?? "").slice(0, 400),
      experience: candidate.experience ?? "",
      projects: normalizeStringArray(candidate.projects, 4),
    },
    job: {
      title: job.title ?? "",
      company: job.company ?? "",
      tags: normalizeStringArray(job.tags, 12),
      location: job.location ?? "",
      description: (job.description ?? "").slice(0, 300),
    },
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
          responseSchema: SCREEN_RESPONSE_SCHEMA,
          temperature: 0.3,
        },
      });

      const text = response.text?.trim();

      if (!text) {
        throw new Error(`Gemini (${model}) returned an empty response.`);
      }

      return normalizeScreenResult(JSON.parse(text));
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

  const { candidate, job } = body;

  try {
    const result = await generateGeminiScreen(candidate, job);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Gemini screen API failed, using fallback:", error);
    return NextResponse.json(buildFallbackScreen(candidate, job));
  }
}
