import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import type { CredentialTier } from "./credentialtier";

export const TIER_GUIDANCE: Record<CredentialTier, string> = {
  high: `Credential tier: HIGH (GPA 3.8+ with strong SAT/ACT, or exceptional GPA with competitive testing).
School selection rules for this tier:
- reachSchools: Ivy League and Top 20 universities (e.g. Harvard, Yale, Princeton, Columbia, Duke, Northwestern, Rice, Vanderbilt, Cornell, Brown).
- targetSchools: Top state flagships and highly ranked publics (e.g. University of Virginia, UNC Chapel Hill, University of Michigan, UCLA, UC Berkeley, Georgia Tech, UT Austin).
- safetySchools: Strong state universities where the student's stats exceed typical middle-50% ranges (e.g. Penn State, Ohio State, University of Florida, Arizona State University, University of Maryland).`,

  average: `Credential tier: AVERAGE (GPA roughly 2.8–3.5, or moderate test scores).
School selection rules for this tier:
- reachSchools: Competitive state flagships and well-known public universities (e.g. Penn State, University of Georgia, Ohio State, University of Washington, Florida State University).
- targetSchools: Regional state universities and accessible public campuses (e.g. University of Oregon, Kansas State University, University of Alabama, San Jose State University, University of Nevada, Reno).
- safetySchools: High-admit-rate state and private colleges (e.g. University of Arizona, Arizona State University, University of North Texas, Grand Valley State University, Liberty University).`,

  low: `Credential tier: LOW (GPA below 2.5 and/or low SAT/ACT).
School selection rules for this tier:
- reachSchools: Regional state universities with test-optional or flexible admissions (e.g. University of Maine, Eastern Michigan University, Wichita State University, University of Texas at El Paso).
- targetSchools: Open-enrollment universities, community colleges, and transfer-pathway schools (e.g. California State University Dominguez Hills, Metropolitan State University, Miami Dade College, Northern Virginia Community College, Portland Community College).
- safetySchools: Community college to 4-year transfer programs and accessible open-admission pathways (e.g. Santa Monica College, Valencia College, Lone Star College, Bunker Hill Community College, Maricopa Community Colleges).`,
};
