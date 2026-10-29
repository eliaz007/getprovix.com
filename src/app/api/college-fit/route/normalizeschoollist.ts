import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import type { SchoolFit } from "./schoolfit";
import { normalizeSchoolFit } from "./normalizeschoolfit";

export function normalizeSchoolList(value: unknown): SchoolFit[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeSchoolFit)
    .filter((school): school is SchoolFit => school !== null);
}
