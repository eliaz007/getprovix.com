import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import type { CredentialTier } from "./credentialtier";

export type ParsedCredentials = {
  gpa: string;
  gpaNumeric: number | null;
  testScores: string;
  sat: number | null;
  act: number | null;
  major: string;
  locationPreference: string;
  budgetPreference: string;
  tier: CredentialTier;
};
