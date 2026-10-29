import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import { InterviewQuestion } from "./interviewquestion";
import { InterviewSimulatorResult } from "./interviewsimulatorresult";
import { normalizeQuestion } from "./normalizequestion";

export function normalizeInterviewResult(raw: unknown): InterviewSimulatorResult {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const questions = Array.isArray(record.questions)
    ? record.questions
        .map(normalizeQuestion)
        .filter((item): item is InterviewQuestion => item !== null)
        .slice(0, 4)
    : [];

  const technicalTrap =
    typeof record.technicalTrap === "string" && record.technicalTrap.trim()
      ? record.technicalTrap.trim()
      : "Avoid hand-waving on tradeoffs — interviewers penalize vague answers without constraints or metrics.";

  const closingQuestion =
    typeof record.closingQuestion === "string" && record.closingQuestion.trim()
      ? record.closingQuestion.trim()
      : "What does success look like in the first 90 days for this role on your team?";

  return {
    questions,
    technicalTrap,
    closingQuestion,
  };
}
