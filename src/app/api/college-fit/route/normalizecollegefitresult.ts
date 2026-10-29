import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import type { CollegeFitResult } from "./collegefitresult";
import { normalizeSchoolList } from "./normalizeschoollist";

export function normalizeCollegeFitResult(raw: unknown): CollegeFitResult {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const summary =
    typeof record.summary === "string" && record.summary.trim()
      ? record.summary.trim()
      : "Your profile suggests a balanced list of reach, target, and safety options to explore further.";

  return {
    summary,
    reachSchools: normalizeSchoolList(record.reachSchools),
    targetSchools: normalizeSchoolList(record.targetSchools),
    safetySchools: normalizeSchoolList(record.safetySchools),
  };
}
