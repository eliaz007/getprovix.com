import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import { SCHOOL_SCHEMA } from "./school-schema";

export const COLLEGE_FIT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "2-3 sentence overview in second person (You/Your).",
    },
    reachSchools: {
      type: Type.ARRAY,
      items: SCHOOL_SCHEMA,
    },
    targetSchools: {
      type: Type.ARRAY,
      items: SCHOOL_SCHEMA,
    },
    safetySchools: {
      type: Type.ARRAY,
      items: SCHOOL_SCHEMA,
    },
  },
  required: ["summary", "reachSchools", "targetSchools", "safetySchools"],
};
