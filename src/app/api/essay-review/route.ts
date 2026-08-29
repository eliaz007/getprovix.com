import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { requireAiApiAccess } from "@/lib/api-auth";

type EssayReviewRequestBody = {
  prompt?: string;
  draft?: string;
  targetSchool?: string;
};

export type LineFeedback = {
  originalText: string;
  suggestion: string;
  reason: string;
};

export type EssayReviewResult = {
  overallScore: number;
  verdict: string;
  strengths: string[];
  improvements: string[];
  lineFeedback: LineFeedback[];
};

const SYSTEM_PROMPT = `You are an expert college admissions essay coach for Provix. Review the student's essay draft against the provided college prompt.

Return strict JSON only in this exact structure:
{
  "overallScore": number (integer 1-10),
  "verdict": "1-2 sentence overall assessment written in second person (You/Your)",
  "strengths": ["strength1", "strength2"],
  "improvements": ["improvement1", "improvement2"],
  "lineFeedback": [
    {
      "originalText": "exact quote or paraphrased phrase from the draft",
      "suggestion": "specific rewrite or edit",
      "reason": "brief explanation of why"
    }
  ]
}

Rules:
- overallScore must be an integer from 1 to 10 inclusive.
- verdict speaks directly to the student using "You" / "Your".
- strengths: 2-4 specific positives about voice, structure, authenticity, or fit.
- improvements: 2-4 actionable areas to strengthen the essay.
- lineFeedback: 2-5 targeted suggestions referencing actual phrases from the draft.
- Consider the target school when provided, but focus primarily on essay quality and prompt alignment.
- Do not include markdown, code fences, or extra keys.`;

const ESSAY_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overallScore: {
      type: Type.INTEGER,
      description: "Overall essay score from 1 to 10.",
    },
    verdict: {
      type: Type.STRING,
      description: "Brief overall assessment in second person.",
    },
    strengths: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    improvements: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    lineFeedback: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          originalText: { type: Type.STRING },
          suggestion: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ["originalText", "suggestion", "reason"],
      },
    },
  },
  required: [
    "overallScore",
    "verdict",
    "strengths",
    "improvements",
    "lineFeedback",
  ],
};

const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-3.6-flash",
  "gemini-2.0-flash",
] as const;

function clampScore(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return 6;
  }

  return Math.min(10, Math.max(1, Math.round(numeric)));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeLineFeedback(value: unknown): LineFeedback[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      originalText:
        typeof item.originalText === "string" ? item.originalText.trim() : "",
      suggestion:
        typeof item.suggestion === "string" ? item.suggestion.trim() : "",
      reason: typeof item.reason === "string" ? item.reason.trim() : "",
    }))
    .filter((item) => item.originalText || item.suggestion || item.reason);
}

function normalizeEssayReview(raw: unknown): EssayReviewResult {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const verdict =
    typeof record.verdict === "string" && record.verdict.trim()
      ? record.verdict.trim()
      : "Your essay shows promise but needs more refinement to fully answer the prompt.";

  return {
    overallScore: clampScore(record.overallScore),
    verdict,
    strengths: normalizeStringArray(record.strengths),
    improvements: normalizeStringArray(record.improvements),
    lineFeedback: normalizeLineFeedback(record.lineFeedback),
  };
}

function buildFallbackReview(
  prompt: string,
  draft: string,
  targetSchool?: string
): EssayReviewResult {
  const wordCount = draft.trim().split(/\s+/).filter(Boolean).length;
  const hasStrongLength = wordCount >= 250 && wordCount <= 650;
  const schoolNote = targetSchool
    ? ` for ${targetSchool}`
    : "";

  const overallScore = clampScore(
    hasStrongLength ? 7 : wordCount < 150 ? 5 : 6
  );

  const strengths = hasStrongLength
    ? [
        "Your draft has enough depth to develop a compelling narrative.",
        "You provide material that can be shaped into a clearer personal story.",
      ]
    : ["You have a starting point to build from with focused revision."];

  const improvements = [
    wordCount < 250
      ? "Expand key moments with specific details and reflection."
      : "Tighten sentences and ensure every paragraph advances your main theme.",
    prompt
      ? "Make sure each section directly addresses the college prompt."
      : "Add a clearer through-line that connects your experiences.",
  ];

  const firstSentence =
    draft.trim().split(/[.!?]/)[0]?.trim().slice(0, 120) ||
    draft.trim().slice(0, 120);

  return {
    overallScore,
    verdict: `Your essay${schoolNote} has a workable foundation, but you should strengthen prompt alignment and add more vivid, specific details.`,
    strengths,
    improvements,
    lineFeedback: firstSentence
      ? [
          {
            originalText: firstSentence,
            suggestion:
              "Open with a specific scene or moment that immediately reveals your perspective.",
            reason:
              "Admissions readers connect faster when the essay starts in media res with concrete detail.",
          },
        ]
      : [],
  };
}

function isValidRequestBody(
  body: unknown
): body is { prompt: string; draft: string; targetSchool?: string } {
  if (!body || typeof body !== "object") {
    return false;
  }

  const record = body as EssayReviewRequestBody;
  return (
    typeof record.prompt === "string" &&
    record.prompt.trim().length > 0 &&
    typeof record.draft === "string" &&
    record.draft.trim().length > 0
  );
}

async function generateGeminiEssayReview(
  prompt: string,
  draft: string,
  targetSchool?: string
): Promise<EssayReviewResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const userPrompt = `Review this college admissions essay.

College Prompt:
${prompt}

${targetSchool ? `Target School: ${targetSchool}` : "Target School: Not specified"}

Essay Draft:
${draft}`;

  let lastError: unknown;

  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: ESSAY_RESPONSE_SCHEMA,
          temperature: 0.3,
        },
      });

      const text = response.text?.trim();

      if (!text) {
        throw new Error(`Gemini (${model}) returned an empty response.`);
      }

      return normalizeEssayReview(JSON.parse(text));
    } catch (error) {
      lastError = error;
      console.error(`Gemini essay review failed for model ${model}:`, error);
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
          "Request body must include non-empty prompt and draft strings.",
      },
      { status: 400 }
    );
  }

  const { prompt, draft, targetSchool } = body;

  try {
    const result = await generateGeminiEssayReview(prompt, draft, targetSchool);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Gemini Essay Review Error:", error);
    return NextResponse.json(
      buildFallbackReview(prompt, draft, targetSchool)
    );
  }
}
