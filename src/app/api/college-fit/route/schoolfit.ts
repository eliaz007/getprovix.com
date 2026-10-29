import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";

export type SchoolFit = {
  name: string;
  location: string;
  matchReason: string;
  fitBadge: string;
  acceptanceOdds: string;
  departmentalStrengths: string;
  financialProfile: string;
  essayAngles: string[];
  profileRedFlags: string[];
};
