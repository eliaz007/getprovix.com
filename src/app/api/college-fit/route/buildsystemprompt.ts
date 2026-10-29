import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import type { CredentialTier } from "./credentialtier";
import { BASE_SYSTEM_RULES } from "./base-system-rules";
import { TIER_GUIDANCE } from "./tier-guidance";

export function buildSystemPrompt(tier: CredentialTier): string {
  return `${BASE_SYSTEM_RULES}

${TIER_GUIDANCE[tier]}`;
}
