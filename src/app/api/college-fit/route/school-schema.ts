import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";

export const SCHOOL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    location: { type: Type.STRING },
    matchReason: {
      type: Type.STRING,
      description: "One concise second-person summary sentence.",
    },
    fitBadge: { type: Type.STRING },
    acceptanceOdds: {
      type: Type.STRING,
      description:
        "Estimated admit probability range or competitiveness label for this student.",
    },
    departmentalStrengths: {
      type: Type.STRING,
      description:
        "Specific academic departments, labs, or programs that fit the student's major.",
    },
    financialProfile: {
      type: Type.STRING,
      description:
        "Net cost outlook, merit aid potential, and budget alignment for the student.",
    },
    essayAngles: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2-3 tailored essay themes for this school.",
    },
    profileRedFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Specific gaps or risks in the student's profile for this school.",
    },
  },
  required: [
    "name",
    "location",
    "matchReason",
    "fitBadge",
    "acceptanceOdds",
    "departmentalStrengths",
    "financialProfile",
    "essayAngles",
    "profileRedFlags",
  ],
};
