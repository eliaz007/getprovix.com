import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";

export function parseTestScores(value: string): { sat: number | null; act: number | null } {
  const normalized = value.trim();
  if (!normalized) {
    return { sat: null, act: null };
  }

  const satExplicit = normalized.match(/SAT[^0-9]*(\d{3,4})/i);
  const actExplicit = normalized.match(/ACT[^0-9]*(\d{1,2})/i);

  let sat: number | null = satExplicit
    ? Number.parseInt(satExplicit[1], 10)
    : null;
  let act: number | null = actExplicit
    ? Number.parseInt(actExplicit[1], 10)
    : null;

  if (sat === null) {
    const satCandidate = normalized.match(/\b(1[0-9]{3})\b/);
    if (satCandidate) {
      const parsed = Number.parseInt(satCandidate[1], 10);
      if (parsed >= 400 && parsed <= 1600) {
        sat = parsed;
      }
    }
  }

  if (act === null) {
    const actCandidate = normalized.match(/\b([1-3][0-9])\b/);
    if (actCandidate) {
      const parsed = Number.parseInt(actCandidate[1], 10);
      if (parsed >= 1 && parsed <= 36) {
        act = parsed;
      }
    }
  }

  return { sat, act };
}
