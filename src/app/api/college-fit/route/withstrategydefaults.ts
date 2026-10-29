import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import type { SchoolFit } from "./schoolfit";
import type { SchoolCategory } from "./schoolcategory";
import type { ParsedCredentials } from "./parsedcredentials";

export function withStrategyDefaults(
  school: {
    name: string;
    location: string;
    matchReason: string;
    fitBadge: string;
  },
  credentials: ParsedCredentials,
  category: SchoolCategory
): SchoolFit {
  const oddsByCategory: Record<SchoolCategory, string> = {
    reach: "15–30% estimated admit probability for your current profile",
    target: "45–65% estimated admit probability with a strong application",
    safety: "75%+ likely admit if you maintain your current academic record",
  };

  const redFlags: string[] = [];
  if (category === "reach") {
    redFlags.push(
      "Reach schools require standout essays and demonstrated rigor beyond baseline stats."
    );
  }
  if (credentials.tier === "low") {
    redFlags.push(
      "Strengthen GPA trend and consider test-optional strategy where available."
    );
  }
  if (credentials.sat === null && credentials.act === null) {
    redFlags.push(
      "Submitting competitive test scores could improve merit aid and admit odds."
    );
  }

  const budgetNote =
    credentials.budgetPreference !== "No preference"
      ? credentials.budgetPreference
      : "your target net cost";

  return {
    ...school,
    acceptanceOdds: oddsByCategory[category],
    departmentalStrengths: `${school.name} offers solid ${credentials.major} coursework with internship pipelines and faculty-led projects worth highlighting in your application.`,
    financialProfile: `Review ${school.name}'s net price calculator — merit and need-based aid may help align costs with ${budgetNote}.`,
    essayAngles: [
      `Why ${credentials.major} at ${school.name} specifically`,
      "A community impact or leadership story tied to your background",
      "An intellectual curiosity spike connected to a campus program or lab",
    ],
    profileRedFlags: redFlags.slice(0, 3),
  };
}
