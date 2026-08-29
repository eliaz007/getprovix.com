import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import {
  buildFallbackMatch,
  normalizeMatchResult,
  normalizeStringArray,
  type MatchCandidatePayload,
  type MatchJobPayload,
  type MatchResult,
} from "@/lib/match-heuristic";
import { requireAiApiAccess } from "@/lib/api-auth";

export type { MatchResult };

const SYSTEM_PROMPT = `Score how well this candidate fits the employer's job and search query.
Use skills, tech stack, bio, job title, job description, tags, and searchQuery.
Return JSON only:
{"score":0-100,"breakdown":"one short sentence about the candidate's fit"}
Keep breakdown under 20 words. No markdown. Do not default to a mid-range score.`;

const MATCH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    score: {
      type: Type.INTEGER,
      description: "Integer fit score between 0 and 100. Do not default to a mid-range score.",
    },
    breakdown: {
      type: Type.STRING,
      description:
        "One concise sentence explaining why this candidate fits or misses the role.",
    },
  },
  required: ["score", "breakdown"],
};

const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-3.6-flash",
  "gemini-2.0-flash",
] as const;

function isValidRequestBody(
  body: unknown
): body is { candidate: MatchCandidatePayload; job: MatchJobPayload } {
  if (!body || typeof body !== "object") {
    return false;
  }

  const record = body as {
    candidate?: MatchCandidatePayload;
    job?: MatchJobPayload;
  };

  return (
    !!record.candidate &&
    typeof record.candidate === "object" &&
    !!record.job &&
    typeof record.job === "object"
  );
}

async function generateGeminiMatch(
  apiKey: string,
  candidate: MatchCandidatePayload,
  job: MatchJobPayload
): Promise<MatchResult> {
  const ai = new GoogleGenAI({ apiKey });

  const userPrompt = JSON.stringify({
    candidate: {
      title: candidate.title ?? "",
      skills: normalizeStringArray(candidate.skills),
      degree: candidate.degree ?? "",
      bio: (candidate.bio ?? "").slice(0, 400),
    },
    job: {
      title: job.title ?? "",
      company: job.company ?? "",
      tags: normalizeStringArray(job.tags),
      location: job.location ?? "",
      description: (job.description ?? "").slice(0, 600),
      searchQuery: job.searchQuery ?? "",
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

      const parsed = normalizeMatchResult(JSON.parse(text));
      const fallbackSkills = buildFallbackMatch(candidate, job);

      return {
        ...parsed,
        matching_skills:
          parsed.matching_skills.length > 0
            ? parsed.matching_skills
            : fallbackSkills.matching_skills,
        missing_skills:
          parsed.missing_skills.length > 0
            ? parsed.missing_skills
            : fallbackSkills.missing_skills,
      };
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
  const denied = await requireAiApiAccess();
  if (denied) {
    return denied;
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

  const { candidate, job } = body;
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not configured — using heuristic fallback.");
    return NextResponse.json(buildFallbackMatch(candidate, job));
  }

  try {
    const result = await generateGeminiMatch(apiKey, candidate, job);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Gemini match API failed, using fallback:", error);
    return NextResponse.json(buildFallbackMatch(candidate, job));
  }
}
