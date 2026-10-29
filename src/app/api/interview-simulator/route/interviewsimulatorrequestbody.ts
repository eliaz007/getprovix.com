import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";

export type InterviewSimulatorRequestBody = {
  targetJobTitle?: string;
  coreTechStack?: string;
  interviewRound?: string;
  companyType?: string;
};
