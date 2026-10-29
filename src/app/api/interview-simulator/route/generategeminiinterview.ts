import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import type { InterviewSimulatorRequestBody } from "./interviewsimulatorrequestbody";
import type { InterviewSimulatorResult } from "./interviewsimulatorresult";
import { SYSTEM_PROMPT } from "./system-prompt";
import { INTERVIEW_RESPONSE_SCHEMA } from "./interview-response-schema";
import { MODEL_CANDIDATES } from "./model-candidates";
import { normalizeInterviewResult } from "./normalizeinterviewresult";

export async function generateGeminiInterview(
  body: InterviewSimulatorRequestBody
): Promise<InterviewSimulatorResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const userPrompt = JSON.stringify({
    targetJobTitle: body.targetJobTitle?.trim() ?? "",
    coreTechStack: body.coreTechStack?.trim() ?? "",
    interviewRound: body.interviewRound?.trim() ?? "Initial Technical Screen",
    companyType: body.companyType?.trim() ?? "Early-Stage Startup",
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
          responseSchema: INTERVIEW_RESPONSE_SCHEMA,
          temperature: 0.35,
        },
      });

      const text = response.text?.trim();

      if (!text) {
        throw new Error(`Gemini (${model}) returned an empty response.`);
      }

      const normalized = normalizeInterviewResult(JSON.parse(text));

      if (normalized.questions.length < 4) {
        throw new Error(`Gemini (${model}) returned fewer than 4 questions.`);
      }

      return normalized;
    } catch (error) {
      lastError = error;
      console.error(`Gemini interview-simulator failed for model ${model}:`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Gemini models failed.");
}
