import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";

export const INTERVIEW_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          idealAnswer: { type: Type.STRING },
          talkingPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["question", "idealAnswer", "talkingPoints"],
      },
    },
    technicalTrap: { type: Type.STRING },
    closingQuestion: { type: Type.STRING },
  },
  required: ["questions", "technicalTrap", "closingQuestion"],
};
