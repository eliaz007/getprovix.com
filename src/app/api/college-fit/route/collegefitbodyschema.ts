import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";

export const collegeFitBodySchema = z.object({
  gpa: z.string().trim().min(1),
  major: z.string().trim().min(1),
  testScores: z.string().optional(),
  locationPreference: z.string().optional(),
  budgetPreference: z.string().optional(),
});
