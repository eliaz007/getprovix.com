import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import { InterviewQuestion } from "./interviewquestion";
import { normalizeStringArray } from "./normalizestringarray";

export function normalizeQuestion(item: unknown): InterviewQuestion | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const record = item as Record<string, unknown>;
  const question =
    typeof record.question === "string" ? record.question.trim() : "";
  const idealAnswer =
    typeof record.idealAnswer === "string" ? record.idealAnswer.trim() : "";

  if (!question) {
    return null;
  }

  return {
    question,
    idealAnswer:
      idealAnswer ||
      "Open with context, explain your approach, tradeoffs, and a concrete example from past work.",
    talkingPoints: normalizeStringArray(record.talkingPoints, 4),
  };
}
