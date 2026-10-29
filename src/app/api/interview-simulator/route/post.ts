import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import { interviewSimulatorBodySchema } from "./interviewsimulatorbodyschema";
import { buildFallbackInterview } from "./buildfallbackinterview";
import { generateGeminiInterview } from "./generategeminiinterview";

export async function POST(request: Request) {
  const denied = await requireAiApiAccess();
  if (denied) {
    return denied;
  }

  const parsedBody = await parseJsonWithSchema(
    request,
    interviewSimulatorBodySchema
  );
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const payload = parsedBody.data;

  try {
    const result = await generateGeminiInterview(payload);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Gemini interview-simulator API failed, using fallback:", error);
    return NextResponse.json(buildFallbackInterview(payload));
  }
}
