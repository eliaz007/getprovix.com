import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import type { SchoolFit } from "./schoolfit";
import { normalizeStringArray } from "./normalizestringarray";

export function normalizeSchoolFit(raw: unknown): SchoolFit | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const location =
    typeof record.location === "string" ? record.location.trim() : "";
  const matchReason =
    typeof record.matchReason === "string" ? record.matchReason.trim() : "";
  const fitBadge =
    typeof record.fitBadge === "string" ? record.fitBadge.trim() : "Good Fit";
  const acceptanceOdds =
    typeof record.acceptanceOdds === "string"
      ? record.acceptanceOdds.trim()
      : "Competitive range depends on application strength.";
  const departmentalStrengths =
    typeof record.departmentalStrengths === "string"
      ? record.departmentalStrengths.trim()
      : "Review departmental rankings and research opportunities for your major.";
  const financialProfile =
    typeof record.financialProfile === "string"
      ? record.financialProfile.trim()
      : "Compare net price estimates and merit aid policies on the school's website.";
  const essayAngles = normalizeStringArray(record.essayAngles, 3);
  const profileRedFlags = normalizeStringArray(record.profileRedFlags, 3);

  if (!name) {
    return null;
  }

  return {
    name,
    location: location || "United States",
    matchReason:
      matchReason || "Your profile aligns with this school's academic profile.",
    fitBadge: fitBadge || "Good Fit",
    acceptanceOdds,
    departmentalStrengths,
    financialProfile,
    essayAngles:
      essayAngles.length > 0
        ? essayAngles
        : [
            "Why this school fits your academic goals",
            "Personal story demonstrating resilience or growth",
          ],
    profileRedFlags,
  };
}
