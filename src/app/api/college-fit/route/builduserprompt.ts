import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import type { ParsedCredentials } from "./parsedcredentials";

export function buildUserPrompt(credentials: ParsedCredentials): string {
  const satLabel =
    credentials.sat !== null ? `${credentials.sat}` : "Not provided / not parsed";
  const actLabel =
    credentials.act !== null ? `${credentials.act}` : "Not provided / not parsed";

  return `Build a comprehensive college fit report using these EXACT student inputs:

GPA: ${credentials.gpa}${credentials.gpaNumeric !== null ? ` (numeric: ${credentials.gpaNumeric})` : ""}
SAT Score: ${satLabel}
ACT Score: ${actLabel}
Raw Test Scores Field: ${credentials.testScores}
Intended Major: ${credentials.major}
Location Preference: ${credentials.locationPreference}
Annual Budget Preference: ${credentials.budgetPreference}
Assigned Credential Tier: ${credentials.tier.toUpperCase()}

Instructions:
- Select REAL schools appropriate for the assigned credential tier above.
- Every school must include rich acceptanceOdds, departmentalStrengths, financialProfile, essayAngles, and profileRedFlags tailored to this student.
- Reference the student's major, location preference, and budget in multiple fields — not only matchReason.
- Do not recommend Ivies for low-tier profiles or community colleges for high-tier profiles unless listed in that tier's rules.`;
}
