import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import type { InterviewQuestion } from "./interviewquestion";

export type InterviewSimulatorResult = {
  questions: InterviewQuestion[];
  technicalTrap: string;
  closingQuestion: string;
};
