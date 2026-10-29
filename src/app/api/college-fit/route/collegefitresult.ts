import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import type { SchoolFit } from "./schoolfit";

export type CollegeFitResult = {
  summary: string;
  reachSchools: SchoolFit[];
  targetSchools: SchoolFit[];
  safetySchools: SchoolFit[];
};
