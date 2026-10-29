import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import type { ParsedCredentials } from "./parsedcredentials";
import { parseGpa } from "./parsegpa";
import { parseTestScores } from "./parsetestscores";
import { getCredentialTier } from "./getcredentialtier";

export function buildParsedCredentials(
  gpa: string,
  major: string,
  testScores?: string,
  locationPreference?: string,
  budgetPreference?: string
): ParsedCredentials {
  const gpaNumeric = parseGpa(gpa);
  const testScoresNormalized = testScores?.trim() || "Not provided";
  const { sat, act } = parseTestScores(testScoresNormalized);

  return {
    gpa: gpa.trim(),
    gpaNumeric,
    testScores: testScoresNormalized,
    sat,
    act,
    major: major.trim(),
    locationPreference: locationPreference?.trim() || "No preference",
    budgetPreference: budgetPreference?.trim() || "No preference",
    tier: getCredentialTier(gpaNumeric, sat, act),
  };
}
