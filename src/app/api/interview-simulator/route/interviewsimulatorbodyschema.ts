import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";

export const interviewSimulatorBodySchema = z
  .object({
    targetJobTitle: z.string().optional(),
    coreTechStack: z.string().optional(),
    interviewRound: z.string().optional(),
    companyType: z.string().optional(),
  })
  .refine(
    (data) => !!data.targetJobTitle?.trim() || !!data.coreTechStack?.trim(),
    {
      message:
        "Provide at least a target job title or core tech stack to simulate.",
    }
  );
