import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import { collegeFitBodySchema } from "./collegefitbodyschema";
import { buildParsedCredentials } from "./buildparsedcredentials";
import { buildFallbackReport } from "./buildfallbackreport";
import { generateGeminiCollegeFit } from "./generategeminicollegefit";

export async function POST(request: Request) {
  const denied = await requireAiApiAccess();
  if (denied) {
    return denied;
  }

  const parsedBody = await parseJsonWithSchema(request, collegeFitBodySchema);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const { gpa, major, testScores, locationPreference, budgetPreference } =
    parsedBody.data;
  const credentials = buildParsedCredentials(
    gpa,
    major,
    testScores,
    locationPreference,
    budgetPreference
  );

  try {
    const result = await generateGeminiCollegeFit(credentials);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[college-fit] Gemini College Fit Error — using fallback:", error);
    return NextResponse.json(buildFallbackReport(credentials));
  }
}
