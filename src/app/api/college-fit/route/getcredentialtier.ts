import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import type { CredentialTier } from "./credentialtier";

export function getCredentialTier(
  gpaNumeric: number | null,
  sat: number | null,
  act: number | null
): CredentialTier {
  const gpa = gpaNumeric ?? 0;
  const satHigh = sat !== null && sat >= 1400;
  const actHigh = act !== null && act >= 31;
  const satLow = sat !== null && sat < 1000;
  const actLow = act !== null && act < 20;

  if (gpa < 2.5 || ((satLow || actLow) && gpa < 3.0)) {
    return "low";
  }

  if (gpa >= 3.8 && (satHigh || actHigh)) {
    return "high";
  }

  if (gpa >= 3.8 && sat === null && act === null) {
    return "high";
  }

  return "average";
}
