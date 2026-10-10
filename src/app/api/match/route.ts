import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildDeterministicEmployerMatch,
  buildEmployerVerifiedMatchContext,
  type EmployerMatchCandidatePayload,
} from "@/lib/employer-match";
import {
  normalizeMatchResult,
  normalizeStringArray,
  type MatchJobPayload,
  type MatchResult,
} from "@/lib/match-heuristic";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import { filterTechnicalRequirements } from "@/lib/technical-skill-requirements";

export type { MatchResult };

const matchRequestBodySchema = z.object({
  candidate: z.looseObject({}),
  job: z.looseObject({}),
});

const SYSTEM_PROMPT = `You are Provix employer talent-matching analyst.

match_percentage is PRECOMPUTED in TypeScript and passed as precomputedMatchScore. Do NOT invent, adjust, or return a numeric score. Write only a concise employer-facing evaluation sentence.

Use verifiedTechnologies, productionSignals (CI/test pillars, audited repo), experience level, overlapping/missing skills, and the job requirements. Never invent frameworks, packages, or audit metrics absent from the candidate payload.

Return strict JSON only:
{"breakdown":"one short sentence about the candidate's fit for the employer"}

Rules:
- Keep breakdown under 28 words.
- Cite only verified technologies and audit signals from the payload.
- No markdown. No score field. No extra keys.`;

const MATCH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    breakdown: {
      type: Type.STRING,
      description:
        "One concise employer-facing sentence explaining fit. Do not include a numeric score.",
    },
  },
  required: ["breakdown"],
};

/** Working Gemini models in this repo (avoid deprecated 2.0/2.5 404 IDs). */
const MODEL_CANDIDATES = [
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
] as const;

async function generateGeminiEmployerMatchNarrative(
  apiKey: string,
  candidate: EmployerMatchCandidatePayload,
  job: MatchJobPayload,
  deterministic: MatchResult
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const verified = buildEmployerVerifiedMatchContext(candidate);

  const userPrompt = JSON.stringify({
    candidate: {
      title: candidate.title ?? "",
      verifiedTechnologies: verified.verifiedTechnologies,
      experienceLevel: verified.experienceLevel,
      degree: candidate.degree ?? "",
      bio: (candidate.bio ?? "").slice(0, 400),
      github_url: candidate.github_url ?? candidate.githubUrl ?? "",
      github: verified.github,
      productionSignals: verified.productionSignals,
      auditScore: verified.auditScore,
    },
    job: {
      title: job.title ?? "",
      company: job.company ?? "",
      techStack: filterTechnicalRequirements(
        normalizeStringArray(job.techStack ?? job.tech_stack)
      ),
      requiredSkills: filterTechnicalRequirements(
        normalizeStringArray(job.requiredSkills ?? job.required_skills)
      ),
      tags: filterTechnicalRequirements(normalizeStringArray(job.tags)),
      location: job.location ?? "",
      description: (job.description ?? "").slice(0, 600),
      searchQuery: job.searchQuery ?? "",
    },
    overlappingSkills: deterministic.matching_skills,
    missingSkills: deterministic.missing_skills,
    precomputedMatchScore: deterministic.match_percentage,
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
          temperature: 0,
        },
      });

      const text = response.text?.trim();
      if (!text) {
        throw new Error(`Gemini (${model}) returned an empty response.`);
      }

      const parsed = normalizeMatchResult(JSON.parse(text));
      if (parsed.reasoning.trim()) {
        return parsed.reasoning.trim();
      }
    } catch (error) {
      lastError = error;
      console.error(`Gemini employer match failed for model ${model}:`, error);
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

  const parsedBody = await parseJsonWithSchema(request, matchRequestBodySchema);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const candidate = parsedBody.data.candidate as EmployerMatchCandidatePayload;
  const job = parsedBody.data.job as MatchJobPayload;
  const deterministic = buildDeterministicEmployerMatch(candidate, job);

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      "GEMINI_API_KEY is not configured — returning deterministic employer match."
    );
    return NextResponse.json(deterministic satisfies MatchResult);
  }

  try {
    const reasoning = await generateGeminiEmployerMatchNarrative(
      apiKey,
      candidate,
      job,
      deterministic
    );

    return NextResponse.json({
      match_percentage: deterministic.match_percentage,
      reasoning,
      matching_skills: deterministic.matching_skills,
      missing_skills: deterministic.missing_skills,
    } satisfies MatchResult);
  } catch (error) {
    console.error("Gemini employer match API failed, using deterministic:", error);
    return NextResponse.json(deterministic satisfies MatchResult);
  }
}
