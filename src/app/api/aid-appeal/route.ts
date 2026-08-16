import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

type AidAppealRequestBody = {
  collegeName?: string;
  currentOffer?: string;
  appealReason?: string;
  contextDetails?: string;
};

export type StrategyScore =
  | "Strong Leverage"
  | "Moderate Leverage"
  | "Needs Evidence";

export type AidAppealResult = {
  strategyScore: StrategyScore;
  strategyAnalysis: string;
  requiredDocuments: string[];
  negotiationDosAndDonts: string[];
  letterSubject: string;
  letterBody: string;
};

const SYSTEM_PROMPT = `You are an expert college financial aid advisor and appeal strategist for Provix. Your role is to assess case strength, identify required evidence, and draft a professional appeal letter the student can customize.

Return strict JSON only in this exact structure:
{
  "strategyScore": "Strong Leverage" | "Moderate Leverage" | "Needs Evidence",
  "strategyAnalysis": "One cohesive paragraph assessing case strength, key leverage points, and gaps",
  "requiredDocuments": ["document1", "document2"],
  "negotiationDosAndDonts": ["do or don't item1", "do or don't item2"],
  "letterSubject": "Professional email subject line for the appeal",
  "letterBody": "Full multi-paragraph appeal letter ready to customize"
}

Rules:
- strategyScore must be exactly one of: "Strong Leverage", "Moderate Leverage", "Needs Evidence".
- strategyAnalysis: 3-5 sentences of factual, professional assessment — no emotional fluff.
- requiredDocuments: 4-6 specific documents the student should gather and attach (e.g., "Updated FAFSA SAR showing revised EFC", "Signed competing award letter from [School Name]").
- negotiationDosAndDonts: 4-6 concise items mixing recommended practices and pitfalls (prefix with "Do:" or "Don't:" where helpful).
- letterSubject: clear, respectful subject line (no markdown).
- letterBody: complete formal letter with greeting, body paragraphs, and sign-off. Use clear bracketed data placeholders for figures and facts the student must insert, such as [Insert Exact Merit Award Amount], [Insert Competing School Name], [Insert Updated Household Income], [Your Name] — never invent specific dollar amounts or dates the student did not provide.
- Tone: respectful, specific, evidence-based, and professional — never entitled, demanding, or overly emotional.
- Do not include markdown, code fences, or extra keys.`;

const AID_APPEAL_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    strategyScore: {
      type: Type.STRING,
      enum: ["Strong Leverage", "Moderate Leverage", "Needs Evidence"],
    },
    strategyAnalysis: { type: Type.STRING },
    requiredDocuments: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    negotiationDosAndDonts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    letterSubject: { type: Type.STRING },
    letterBody: { type: Type.STRING },
  },
  required: [
    "strategyScore",
    "strategyAnalysis",
    "requiredDocuments",
    "negotiationDosAndDonts",
    "letterSubject",
    "letterBody",
  ],
};

const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-3.6-flash",
  "gemini-2.0-flash",
] as const;

const VALID_STRATEGY_SCORES: StrategyScore[] = [
  "Strong Leverage",
  "Moderate Leverage",
  "Needs Evidence",
];

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeStrategyScore(value: unknown): StrategyScore {
  if (
    typeof value === "string" &&
    VALID_STRATEGY_SCORES.includes(value as StrategyScore)
  ) {
    return value as StrategyScore;
  }

  return "Moderate Leverage";
}

function normalizeAidAppealResult(raw: unknown): AidAppealResult {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const letterSubject =
    typeof record.letterSubject === "string" && record.letterSubject.trim()
      ? record.letterSubject.trim()
      : "Request for Financial Aid Reconsideration";

  const letterBody =
    typeof record.letterBody === "string" && record.letterBody.trim()
      ? record.letterBody.trim()
      : "Dear Financial Aid Committee,\n\nI respectfully request a review of my financial aid package.\n\nSincerely,\n[Your Name]";

  const strategyAnalysis =
    typeof record.strategyAnalysis === "string" &&
    record.strategyAnalysis.trim()
      ? record.strategyAnalysis.trim()
      : "Your appeal has moderate potential, but strengthening it with verifiable documentation will improve outcomes.";

  return {
    strategyScore: normalizeStrategyScore(record.strategyScore),
    strategyAnalysis,
    requiredDocuments: normalizeStringArray(record.requiredDocuments),
    negotiationDosAndDonts: normalizeStringArray(record.negotiationDosAndDonts),
    letterSubject,
    letterBody,
  };
}

function buildFallbackAidAppeal(
  collegeName: string,
  currentOffer: string | undefined,
  appealReason: string,
  contextDetails: string
): AidAppealResult {
  const hasCompetingOffer = appealReason.toLowerCase().includes("competing");
  const hasHardship = appealReason.toLowerCase().includes("hardship");
  const hasMerit = appealReason.toLowerCase().includes("merit");
  const hasRichContext = contextDetails.trim().length >= 120;

  const strategyScore: StrategyScore = hasRichContext
    ? hasCompetingOffer || hasHardship
      ? "Strong Leverage"
      : "Moderate Leverage"
    : "Needs Evidence";

  const offerReference = currentOffer
    ? `Your current offer (${currentOffer}) gives the office a concrete baseline to review. `
    : "Without a documented current offer on file, lead with [Insert Current Aid Offer Breakdown] so the committee can compare packages. ";

  const strategyAnalysis = hasRichContext
    ? `${offerReference}Your appeal basis (${appealReason}) is supported by specific context you provided, which strengthens a professional reconsideration request at ${collegeName}. Focus on verifiable changes rather than general hardship language, and tie each claim to a document the office can verify.`
    : `${offerReference}Your appeal basis (${appealReason}) is directionally sound, but the case currently lacks enough verifiable detail for strong leverage. Add exact figures, dates, and supporting documents before sending — financial aid offices approve appeals based on evidence, not sentiment.`;

  const requiredDocuments = [
    "Copy of your official financial aid award letter from " + collegeName,
    currentOffer
      ? "Itemized breakdown matching your stated offer: " + currentOffer
      : "[Insert Itemized Aid Offer Breakdown — grants, loans, work-study]",
    "Updated FAFSA SAR or CSS Profile documentation reflecting current household finances",
  ];

  if (hasCompetingOffer) {
    requiredDocuments.push(
      "Signed competing award letter from [Insert Competing School Name] showing [Insert Exact Competing Grant Amount]"
    );
  }

  if (hasHardship) {
    requiredDocuments.push(
      "Supporting documentation for changed circumstances (e.g., termination letter, medical bills, or revised tax return)"
    );
  }

  if (hasMerit) {
    requiredDocuments.push(
      "Updated transcript or merit documentation supporting [Insert GPA/Test Score or Achievement]"
    );
  }

  requiredDocuments.push(
    "Brief cover email listing each attached document and what it demonstrates"
  );

  const negotiationDosAndDonts = [
    "Do: Email the financial aid office directly (not admissions) with a clear subject line and numbered attachment list.",
    "Do: Ask whether the school can increase grants before adding or converting to loans.",
    "Do: Follow up politely after 7–10 business days if you have not received a response.",
    "Don't: Present a competing offer as an ultimatum — frame it as a respectful benchmark.",
    "Don't: Send an appeal without attaching the documents listed in your letter.",
    "Don't: Use emotional language without linking each claim to verifiable evidence.",
  ];

  const offerLine = currentOffer
    ? `My current financial aid offer is ${currentOffer}. `
    : "My current financial aid offer is [Insert Exact Aid Offer Breakdown]. ";

  const contextBlock = contextDetails.trim()
    ? `\n\n${contextDetails.trim()}`
    : "";

  const letterBody = `Dear Financial Aid Committee at ${collegeName},

Thank you for offering me admission and for the financial aid package I received. I am writing to respectfully request a reconsideration of my aid award based on ${appealReason.toLowerCase()}.

${offerLine}Since receiving my initial package, my circumstances have changed in ways that were not fully reflected in my original application.${contextBlock}

I have attached [Insert List of Supporting Documents] for your review. I would be grateful if your office could reassess my file in light of this updated, verifiable information. ${collegeName} remains my top choice, and additional grant support at the level of [Insert Target Grant Amount or Gap to Close] would make enrollment feasible for my family.

Thank you for your time and consideration.

Sincerely,
[Your Name]`;

  return {
    strategyScore,
    strategyAnalysis,
    requiredDocuments,
    negotiationDosAndDonts,
    letterSubject: `Financial Aid Appeal — ${collegeName}`,
    letterBody,
  };
}

function isValidRequestBody(
  body: unknown
): body is {
  collegeName: string;
  currentOffer?: string;
  appealReason: string;
  contextDetails: string;
} {
  if (!body || typeof body !== "object") {
    return false;
  }

  const record = body as AidAppealRequestBody;
  return (
    typeof record.collegeName === "string" &&
    record.collegeName.trim().length > 0 &&
    typeof record.appealReason === "string" &&
    record.appealReason.trim().length > 0 &&
    typeof record.contextDetails === "string" &&
    record.contextDetails.trim().length > 0
  );
}

async function generateGeminiAidAppeal(
  collegeName: string,
  currentOffer: string | undefined,
  appealReason: string,
  contextDetails: string
): Promise<AidAppealResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const userPrompt = `Analyze this financial aid appeal case and produce a strategy assessment, required documents checklist, negotiation guidance, and customizable appeal letter draft.

College: ${collegeName}
Current Aid Offer: ${currentOffer?.trim() || "Not provided"}
Appeal Reason: ${appealReason}
Additional Context:
${contextDetails}`;

  let lastError: unknown;

  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: AID_APPEAL_RESPONSE_SCHEMA,
          temperature: 0.3,
        },
      });

      const text = response.text?.trim();

      if (!text) {
        throw new Error(`Gemini (${model}) returned an empty response.`);
      }

      return normalizeAidAppealResult(JSON.parse(text));
    } catch (error) {
      lastError = error;
      console.error(`[aid-appeal] Gemini failed for model ${model}:`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Gemini models failed.");
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isValidRequestBody(body)) {
    return NextResponse.json(
      {
        error:
          "Request body must include collegeName, appealReason, and contextDetails.",
      },
      { status: 400 }
    );
  }

  const { collegeName, currentOffer, appealReason, contextDetails } = body;

  try {
    const result = await generateGeminiAidAppeal(
      collegeName.trim(),
      currentOffer?.trim(),
      appealReason.trim(),
      contextDetails.trim()
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error(
      "[aid-appeal] Gemini Aid Appeal Error — using fallback:",
      error
    );
    return NextResponse.json(
      buildFallbackAidAppeal(
        collegeName.trim(),
        currentOffer?.trim(),
        appealReason.trim(),
        contextDetails.trim()
      )
    );
  }
}
