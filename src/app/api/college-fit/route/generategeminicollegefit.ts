import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import type { CollegeFitResult } from "./collegefitresult";
import type { ParsedCredentials } from "./parsedcredentials";
import { COLLEGE_FIT_RESPONSE_SCHEMA } from "./college-fit-response-schema";
import { MODEL_CANDIDATES } from "./model-candidates";
import { buildSystemPrompt } from "./buildsystemprompt";
import { buildUserPrompt } from "./builduserprompt";
import { normalizeCollegeFitResult } from "./normalizecollegefitresult";

export async function generateGeminiCollegeFit(
  credentials: ParsedCredentials
): Promise<CollegeFitResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = buildSystemPrompt(credentials.tier);
  const userPrompt = buildUserPrompt(credentials);

  let lastError: unknown;

  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: COLLEGE_FIT_RESPONSE_SCHEMA,
          temperature: 0,
        },
      });

      const text = response.text?.trim();

      if (!text) {
        throw new Error(`Gemini (${model}) returned an empty response.`);
      }

      return normalizeCollegeFitResult(JSON.parse(text));
    } catch (error) {
      lastError = error;
      console.error(`[college-fit] Gemini College Fit Error (${model}):`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Gemini models failed.");
}
