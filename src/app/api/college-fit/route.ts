import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { requireAiApiAccess } from "@/lib/api-auth";

type CollegeFitRequestBody = {
  gpa?: string;
  testScores?: string;
  major?: string;
  locationPreference?: string;
  budgetPreference?: string;
};

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

export type CollegeFitResult = {
  summary: string;
  reachSchools: SchoolFit[];
  targetSchools: SchoolFit[];
  safetySchools: SchoolFit[];
};

type CredentialTier = "high" | "average" | "low";
type SchoolCategory = "reach" | "target" | "safety";

type ParsedCredentials = {
  gpa: string;
  gpaNumeric: number | null;
  testScores: string;
  sat: number | null;
  act: number | null;
  major: string;
  locationPreference: string;
  budgetPreference: string;
  tier: CredentialTier;
};

const SCHOOL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    location: { type: Type.STRING },
    matchReason: {
      type: Type.STRING,
      description: "One concise second-person summary sentence.",
    },
    fitBadge: { type: Type.STRING },
    acceptanceOdds: {
      type: Type.STRING,
      description:
        "Estimated admit probability range or competitiveness label for this student.",
    },
    departmentalStrengths: {
      type: Type.STRING,
      description:
        "Specific academic departments, labs, or programs that fit the student's major.",
    },
    financialProfile: {
      type: Type.STRING,
      description:
        "Net cost outlook, merit aid potential, and budget alignment for the student.",
    },
    essayAngles: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2-3 tailored essay themes for this school.",
    },
    profileRedFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Specific gaps or risks in the student's profile for this school.",
    },
  },
  required: [
    "name",
    "location",
    "matchReason",
    "fitBadge",
    "acceptanceOdds",
    "departmentalStrengths",
    "financialProfile",
    "essayAngles",
    "profileRedFlags",
  ],
};

const COLLEGE_FIT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "2-3 sentence overview in second person (You/Your).",
    },
    reachSchools: {
      type: Type.ARRAY,
      items: SCHOOL_SCHEMA,
    },
    targetSchools: {
      type: Type.ARRAY,
      items: SCHOOL_SCHEMA,
    },
    safetySchools: {
      type: Type.ARRAY,
      items: SCHOOL_SCHEMA,
    },
  },
  required: ["summary", "reachSchools", "targetSchools", "safetySchools"],
};

const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-1.5-flash",
  "gemini-3.6-flash",
  "gemini-2.0-flash",
] as const;

const BASE_SYSTEM_RULES = `You are an expert college admissions counselor for Provix. Build a comprehensive, personalized college fit report using ONLY real, accredited U.S. colleges and universities that actually exist.

Return strict JSON only in this exact structure:
{
  "summary": "2-3 sentences in second person (You/Your) summarizing the overall fit landscape",
  "reachSchools": [SchoolFit],
  "targetSchools": [SchoolFit],
  "safetySchools": [SchoolFit]
}

Each SchoolFit object MUST include ALL of these fields with rich, specific detail:
{
  "name": string,
  "location": string,
  "matchReason": string,
  "fitBadge": string,
  "acceptanceOdds": string,
  "departmentalStrengths": string,
  "financialProfile": string,
  "essayAngles": [string, string, ...],
  "profileRedFlags": [string, ...]
}

Field requirements:
- name: exact official institution name (e.g. "University of Virginia", not "UVA" alone).
- location: "City, ST" format.
- matchReason: one concise second-person sentence on overall fit.
- fitBadge: short label like "Ivy Reach", "Top Flagship", "Strong Program", "Test-Optional", "Transfer Pathway".
- acceptanceOdds: estimated admit probability or competitiveness for THIS student (e.g. "18–25% reach probability given your GPA/testing" or "70%+ likely admit").
- departmentalStrengths: 2-3 sentences on specific departments, research centers, co-op/internship pipelines, or ranked programs tied to the student's intended major.
- financialProfile: 2-3 sentences on net cost outlook, merit/need aid realism, and alignment with the student's annual budget preference.
- essayAngles: exactly 2-3 tailored essay themes that would differentiate this applicant at THIS school.
- profileRedFlags: 1-3 specific weaknesses or gaps the student should address for THIS school (empty array only if none).

Universal rules:
- Provide 2-4 schools per category (reach, target, safety).
- Weight the student's exact GPA, test scores, major, location preference, and annual budget preference.
- Do not invent fictional institutions.
- Do not include markdown, code fences, or extra keys.
- Be specific — avoid generic filler; every school card should read like a tailored strategy memo.`;

const TIER_GUIDANCE: Record<CredentialTier, string> = {
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

function parseGpa(value: string): number | null {
  const match = value.match(/\d(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const numeric = Number.parseFloat(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseTestScores(value: string): { sat: number | null; act: number | null } {
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

function getCredentialTier(
  gpaNumeric: number | null,
  sat: number | null,
  act: number | null
): CredentialTier {
  const gpa = gpaNumeric ?? 0;
  const satHigh = sat !== null && sat >= 1400;
  const actHigh = act !== null && act >= 31;
  const satLow = sat !== null && sat < 1000;
  const actLow = act !== null && act < 20;

  if (gpa < 2.5 || ((satLow || actLow) && gpa < 3.0)) {
    return "low";
  }

  if (gpa >= 3.8 && (satHigh || actHigh)) {
    return "high";
  }

  if (gpa >= 3.8 && sat === null && act === null) {
    return "high";
  }

  return "average";
}

function buildParsedCredentials(
  gpa: string,
  major: string,
  testScores?: string,
  locationPreference?: string,
  budgetPreference?: string
): ParsedCredentials {
  const gpaNumeric = parseGpa(gpa);
  const testScoresNormalized = testScores?.trim() || "Not provided";
  const { sat, act } = parseTestScores(testScoresNormalized);

  return {
    gpa: gpa.trim(),
    gpaNumeric,
    testScores: testScoresNormalized,
    sat,
    act,
    major: major.trim(),
    locationPreference: locationPreference?.trim() || "No preference",
    budgetPreference: budgetPreference?.trim() || "No preference",
    tier: getCredentialTier(gpaNumeric, sat, act),
  };
}

function buildSystemPrompt(tier: CredentialTier): string {
  return `${BASE_SYSTEM_RULES}

${TIER_GUIDANCE[tier]}`;
}

function buildUserPrompt(credentials: ParsedCredentials): string {
  const satLabel =
    credentials.sat !== null ? `${credentials.sat}` : "Not provided / not parsed";
  const actLabel =
    credentials.act !== null ? `${credentials.act}` : "Not provided / not parsed";

  return `Build a comprehensive college fit report using these EXACT student inputs:

GPA: ${credentials.gpa}${credentials.gpaNumeric !== null ? ` (numeric: ${credentials.gpaNumeric})` : ""}
SAT Score: ${satLabel}
ACT Score: ${actLabel}
Raw Test Scores Field: ${credentials.testScores}
Intended Major: ${credentials.major}
Location Preference: ${credentials.locationPreference}
Annual Budget Preference: ${credentials.budgetPreference}
Assigned Credential Tier: ${credentials.tier.toUpperCase()}

Instructions:
- Select REAL schools appropriate for the assigned credential tier above.
- Every school must include rich acceptanceOdds, departmentalStrengths, financialProfile, essayAngles, and profileRedFlags tailored to this student.
- Reference the student's major, location preference, and budget in multiple fields — not only matchReason.
- Do not recommend Ivies for low-tier profiles or community colleges for high-tier profiles unless listed in that tier's rules.`;
}

function normalizeStringArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function withStrategyDefaults(
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

function normalizeSchoolFit(raw: unknown): SchoolFit | null {
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

function normalizeSchoolList(value: unknown): SchoolFit[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeSchoolFit)
    .filter((school): school is SchoolFit => school !== null);
}

function normalizeCollegeFitResult(raw: unknown): CollegeFitResult {
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

function buildFallbackReport(credentials: ParsedCredentials): CollegeFitResult {
  console.warn(
    "[college-fit] Returning fallback mock data — Gemini API did not succeed.",
    {
      tier: credentials.tier,
      gpa: credentials.gpa,
      sat: credentials.sat,
      act: credentials.act,
      major: credentials.major,
    }
  );

  if (credentials.tier === "high") {
    return {
      summary: `With a ${credentials.gpa} GPA${credentials.sat ? ` and SAT ${credentials.sat}` : ""}, you're positioned for highly selective reach schools while targeting top public flagships for ${credentials.major}.`,
      reachSchools: [
        withStrategyDefaults(
          {
            name: "Cornell University",
            location: "Ithaca, NY",
            matchReason: `Your strong GPA${credentials.sat ? ` and ${credentials.sat} SAT` : ""} make Cornell a realistic reach for ${credentials.major} if your essays and rigor stand out.`,
            fitBadge: "Ivy Reach",
          },
          credentials,
          "reach"
        ),
        withStrategyDefaults(
          {
            name: "Duke University",
            location: "Durham, NC",
            matchReason: `You have the academic profile to compete at a top-20 school with a compelling ${credentials.major} narrative.`,
            fitBadge: "Top 20 Reach",
          },
          credentials,
          "reach"
        ),
      ],
      targetSchools: [
        withStrategyDefaults(
          {
            name: "University of Virginia",
            location: "Charlottesville, VA",
            matchReason: `Your credentials align well with UVA's competitive but achievable range for strong ${credentials.major} applicants.`,
            fitBadge: "Top Flagship",
          },
          credentials,
          "target"
        ),
        withStrategyDefaults(
          {
            name: "University of Michigan",
            location: "Ann Arbor, MI",
            matchReason: `You're a solid target candidate for Michigan's flagship programs given your GPA and testing.`,
            fitBadge: "Top Flagship",
          },
          credentials,
          "target"
        ),
      ],
      safetySchools: [
        withStrategyDefaults(
          {
            name: "Pennsylvania State University",
            location: "University Park, PA",
            matchReason: `Your stats exceed Penn State's typical middle range, making it a dependable safety for ${credentials.major}.`,
            fitBadge: "Strong State Uni",
          },
          credentials,
          "safety"
        ),
        withStrategyDefaults(
          {
            name: "University of Florida",
            location: "Gainesville, FL",
            matchReason: `You should be highly competitive here while still accessing a strong public ${credentials.major} pathway.`,
            fitBadge: "Likely Admit",
          },
          credentials,
          "safety"
        ),
      ],
    };
  }

  if (credentials.tier === "low") {
    return {
      summary: `With a ${credentials.gpa} GPA${credentials.sat ? ` and SAT ${credentials.sat}` : ""}, you should focus on accessible pathways — including community college transfer routes — while building toward a ${credentials.major} degree.`,
      reachSchools: [
        withStrategyDefaults(
          {
            name: "University of Texas at El Paso",
            location: "El Paso, TX",
            matchReason: `Your profile fits UTEP's flexible, test-optional admissions as an ambitious but reachable four-year option.`,
            fitBadge: "Test-Optional",
          },
          credentials,
          "reach"
        ),
        withStrategyDefaults(
          {
            name: "Eastern Michigan University",
            location: "Ypsilanti, MI",
            matchReason: `You can pursue ${credentials.major} here with admissions policies suited to your current academic record.`,
            fitBadge: "Regional Reach",
          },
          credentials,
          "reach"
        ),
      ],
      targetSchools: [
        withStrategyDefaults(
          {
            name: "Metropolitan State University",
            location: "Saint Paul, MN",
            matchReason: `This open-access university offers a direct path into ${credentials.major} without ultra-selective barriers.`,
            fitBadge: "Open Enrollment",
          },
          credentials,
          "target"
        ),
        withStrategyDefaults(
          {
            name: "Miami Dade College",
            location: "Miami, FL",
            matchReason: `You can start here affordably and transfer into a four-year ${credentials.major} program later.`,
            fitBadge: "Transfer Pathway",
          },
          credentials,
          "target"
        ),
      ],
      safetySchools: [
        withStrategyDefaults(
          {
            name: "Northern Virginia Community College",
            location: "Annandale, VA",
            matchReason: `NOVA provides a low-risk safety with strong transfer agreements to Virginia four-year schools.`,
            fitBadge: "CC → 4-Year",
          },
          credentials,
          "safety"
        ),
        withStrategyDefaults(
          {
            name: "Lone Star College",
            location: "The Woodlands, TX",
            matchReason: `You can begin your ${credentials.major} pathway here and transfer once your record strengthens.`,
            fitBadge: "CC → 4-Year",
          },
          credentials,
          "safety"
        ),
      ],
    };
  }

  return {
    summary: `With a ${credentials.gpa} GPA and interest in ${credentials.major}, you have a balanced set of state flagships, regional universities, and high-admit backups to explore${credentials.locationPreference !== "No preference" ? ` in ${credentials.locationPreference}` : ""}.`,
    reachSchools: [
      withStrategyDefaults(
        {
          name: "Pennsylvania State University",
          location: "University Park, PA",
          matchReason: `Penn State is a realistic reach for your GPA and testing profile in ${credentials.major}.`,
          fitBadge: "State Flagship Reach",
        },
        credentials,
        "reach"
      ),
      withStrategyDefaults(
        {
          name: "University of Georgia",
          location: "Athens, GA",
          matchReason: `Your credentials make UGA an ambitious but attainable flagship option.`,
          fitBadge: "Flagship Reach",
        },
        credentials,
        "reach"
      ),
    ],
    targetSchools: [
      withStrategyDefaults(
        {
          name: "University of Alabama",
          location: "Tuscaloosa, AL",
          matchReason: `You match Alabama's typical admit profile for ${credentials.major} applicants in your GPA range.`,
          fitBadge: "Regional Match",
        },
        credentials,
        "target"
      ),
      withStrategyDefaults(
        {
          name: "San Jose State University",
          location: "San Jose, CA",
          matchReason: `Your stats fit SJSU's competitive regional range for ${credentials.major}.`,
          fitBadge: "Regional Target",
        },
        credentials,
        "target"
      ),
    ],
    safetySchools: [
      withStrategyDefaults(
        {
          name: "Arizona State University",
          location: "Tempe, AZ",
          matchReason: `ASU offers high admit rates with solid ${credentials.major} pathways for your profile.`,
          fitBadge: "High Admit",
        },
        credentials,
        "safety"
      ),
      withStrategyDefaults(
        {
          name: "Grand Valley State University",
          location: "Allendale, MI",
          matchReason: `You should be a likely admit here while still pursuing ${credentials.major}.`,
          fitBadge: "Likely Admit",
        },
        credentials,
        "safety"
      ),
    ],
  };
}

function isValidRequestBody(
  body: unknown
): body is {
  gpa: string;
  major: string;
  testScores?: string;
  locationPreference?: string;
  budgetPreference?: string;
} {
  if (!body || typeof body !== "object") {
    return false;
  }

  const record = body as CollegeFitRequestBody;
  return (
    typeof record.gpa === "string" &&
    record.gpa.trim().length > 0 &&
    typeof record.major === "string" &&
    record.major.trim().length > 0
  );
}

async function generateGeminiCollegeFit(
  credentials: ParsedCredentials
): Promise<CollegeFitResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = buildSystemPrompt(credentials.tier);
  const userPrompt = buildUserPrompt(credentials);

  let lastError: unknown;

  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: COLLEGE_FIT_RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      });

      const text = response.text?.trim();

      if (!text) {
        throw new Error(`Gemini (${model}) returned an empty response.`);
      }

      return normalizeCollegeFitResult(JSON.parse(text));
    } catch (error) {
      lastError = error;
      console.error(`[college-fit] Gemini College Fit Error (${model}):`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Gemini models failed.");
}

export async function POST(request: Request) {
  const denied = await requireAiApiAccess();
  if (denied) {
    return denied;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isValidRequestBody(body)) {
    return NextResponse.json(
      { error: "Request body must include non-empty gpa and major strings." },
      { status: 400 }
    );
  }

  const { gpa, major, testScores, locationPreference, budgetPreference } = body;
  const credentials = buildParsedCredentials(
    gpa,
    major,
    testScores,
    locationPreference,
    budgetPreference
  );

  try {
    const result = await generateGeminiCollegeFit(credentials);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[college-fit] Gemini College Fit Error — using fallback:", error);
    return NextResponse.json(buildFallbackReport(credentials));
  }
}
