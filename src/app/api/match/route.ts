import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

type CandidatePayload = {
  title?: string;
  bio?: string;
  skills?: string[] | string;
  degree?: string;
};

type JobPayload = {
  title?: string;
  company?: string;
  tags?: string[] | string;
  location?: string;
};

export type MatchResult = {
  match_percentage: number;
  reasoning: string;
  matching_skills: string[];
  missing_skills: string[];
};

const SYSTEM_PROMPT = `Score candidate vs job fit. Return JSON only:
{"match_percentage":50-99,"reasoning":"one short sentence","matching_skills":["…"],"missing_skills":["…"]}
Keep reasoning under 20 words. No markdown.`;

const MATCH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    match_percentage: {
      type: Type.INTEGER,
      description: "Integer fit score between 50 and 99.",
    },
    reasoning: {
      type: Type.STRING,
      description:
        "One concise sentence in second person (You/Your) explaining the match to the candidate.",
    },
    matching_skills: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    missing_skills: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    "match_percentage",
    "reasoning",
    "matching_skills",
    "missing_skills",
  ],
};

// gemini-2.5-flash is restricted for new API keys; fall back to current replacements.
const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-3.6-flash",
  "gemini-2.0-flash",
] as const;

function clampMatchPercentage(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return 65;
  }

  return Math.min(99, Math.max(50, Math.round(numeric)));
}

function normalizeStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeMatchResult(raw: unknown): MatchResult {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const reasoning =
    typeof record.reasoning === "string" && record.reasoning.trim()
      ? record.reasoning.trim()
      : "Your profile partially aligns with this role's requirements.";

  return {
    match_percentage: clampMatchPercentage(record.match_percentage),
    reasoning,
    matching_skills: normalizeStringArray(record.matching_skills),
    missing_skills: normalizeStringArray(record.missing_skills),
  };
}

function buildFallbackMatch(
  candidate: CandidatePayload,
  job: JobPayload
): MatchResult {
  const candidateSkills = normalizeStringArray(candidate.skills);
  const jobTags = normalizeStringArray(job.tags);

  const normalizedCandidateSkills = candidateSkills.map((skill) =>
    skill.toLowerCase()
  );

  const matching_skills = jobTags.filter((tag) =>
    normalizedCandidateSkills.some(
      (skill) =>
        skill.includes(tag.toLowerCase()) || tag.toLowerCase().includes(skill)
    )
  );

  const missing_skills = jobTags.filter(
    (tag) => !matching_skills.includes(tag)
  );

  const overlapRatio =
    jobTags.length > 0 ? matching_skills.length / jobTags.length : 0.5;

  const match_percentage = clampMatchPercentage(
    50 + Math.round(overlapRatio * 49)
  );

  const reasoning =
    matching_skills.length > 0
      ? `You're a strong fit for ${job.title ?? "this role"} with your ${matching_skills.join(", ")} experience.`
      : `Your profile currently has limited overlap with the required skills for ${job.title ?? "this role"}.`;

  return {
    match_percentage,
    reasoning,
    matching_skills,
    missing_skills,
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

async function generateGeminiMatch(
  candidate: CandidatePayload,
  job: JobPayload
): Promise<MatchResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const userPrompt = JSON.stringify({
    candidate: {
      title: candidate.title ?? "",
      skills: normalizeStringArray(candidate.skills),
      degree: candidate.degree ?? "",
      bio: (candidate.bio ?? "").slice(0, 120),
    },
    job: {
      title: job.title ?? "",
      company: job.company ?? "",
      tags: normalizeStringArray(job.tags),
      location: job.location ?? "",
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
          responseSchema: MATCH_RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      });

      const text = response.text?.trim();

      if (!text) {
        throw new Error(`Gemini (${model}) returned an empty response.`);
      }

      return normalizeMatchResult(JSON.parse(text));
    } catch (error) {
      lastError = error;
      console.error(`Gemini match failed for model ${model}:`, error);
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
    const result = await generateGeminiMatch(candidate, job);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Gemini match API failed, using fallback:", error);
    return NextResponse.json(buildFallbackMatch(candidate, job));
  }
}
