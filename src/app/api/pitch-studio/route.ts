import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

export type PitchStudioRequestBody = {
  targetCompany?: string;
  targetContactRole?: string;
  roleApplyingFor?: string;
  coreValueProp?: string;
  tone?: string;
};

export type PitchTemplate = {
  title: string;
  channel: string;
  body: string;
  copyTip: string;
};

export type PitchStudioResult = {
  pitches: PitchTemplate[];
};

const SYSTEM_PROMPT = `You are Provix's Pitch Studio — an expert at writing high-signal, founder-ready outreach that bypasses ATS filters.

Given a target company, contact role, role applying for, core value prop / top project, and tone preference, generate exactly 3 distinct pitch templates:

1. Short X/LinkedIn DM — concise, scroll-stopping, under 280 characters if possible.
2. Formal Email Pitch — subject-line-ready, professional but not corporate-slop.
3. Loom/Portfolio Intro Script — spoken-word style for a 60-90 second video intro.

Return strict JSON only:
{
  "pitches": [
    {
      "title": "Short label e.g. Short X/LinkedIn DM",
      "channel": "X / LinkedIn DM | Email | Loom / Portfolio Video",
      "body": "The full pitch copy ready to paste",
      "copyTip": "One sentence tip on when/how to send this pitch"
    }
  ]
}

Rules:
- pitches: exactly 3 objects, one per channel above, in that order.
- Match the requested tone throughout (Direct & High Signal, Technical & Proof-Driven, or Casual Founder DM).
- Lead with proof-of-work and specific value — never generic "I'm passionate" filler.
- Reference the target company and contact role naturally when provided.
- Weave in the candidate's core value prop / top project with concrete outcomes.
- body: ready-to-send copy; no placeholders like [Your Name] unless absolutely necessary.
- copyTip: actionable send-timing or personalization advice.
- No markdown, no extra keys.`;

const PITCH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    pitches: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          channel: { type: Type.STRING },
          body: { type: Type.STRING },
          copyTip: { type: Type.STRING },
        },
        required: ["title", "channel", "body", "copyTip"],
      },
    },
  },
  required: ["pitches"],
};

const MODEL_CANDIDATES = [
  "gemini-1.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-3.6-flash",
] as const;

const DEFAULT_PITCH_CHANNELS = [
  { title: "Short X/LinkedIn DM", channel: "X / LinkedIn DM" },
  { title: "Formal Email Pitch", channel: "Email" },
  { title: "Loom/Portfolio Intro Script", channel: "Loom / Portfolio Video" },
] as const;

function normalizePitch(item: unknown): PitchTemplate | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const record = item as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const channel = typeof record.channel === "string" ? record.channel.trim() : "";
  const body = typeof record.body === "string" ? record.body.trim() : "";
  const copyTip = typeof record.copyTip === "string" ? record.copyTip.trim() : "";

  if (!body) {
    return null;
  }

  return {
    title: title || "Pitch Template",
    channel: channel || "Outreach",
    body,
    copyTip: copyTip || "Personalize the opening line before sending.",
  };
}

function normalizePitchResult(raw: unknown): PitchStudioResult {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const pitches = Array.isArray(record.pitches)
    ? record.pitches
        .map(normalizePitch)
        .filter((item): item is PitchTemplate => item !== null)
        .slice(0, 3)
    : [];

  return { pitches };
}

function isValidRequestBody(body: unknown): body is PitchStudioRequestBody {
  if (!body || typeof body !== "object") {
    return false;
  }

  const record = body as PitchStudioRequestBody;
  return (
    !!record.targetCompany?.trim() ||
    !!record.roleApplyingFor?.trim() ||
    !!record.coreValueProp?.trim()
  );
}

function buildFallbackPitches(body: PitchStudioRequestBody): PitchStudioResult {
  const company = body.targetCompany?.trim() || "your target startup";
  const contact = body.targetContactRole?.trim() || "Founder";
  const role = body.roleApplyingFor?.trim() || "Full-Stack Engineer";
  const valueProp =
    body.coreValueProp?.trim() ||
    "I ship production-grade full-stack features with measurable user impact.";
  const tone = body.tone?.trim() || "Direct & High Signal";

  const toneOpener =
    tone === "Casual Founder DM"
      ? "Hey — quick note,"
      : tone === "Technical & Proof-Driven"
        ? "Hi — I'll keep this technical and specific:"
        : "Hi — high-signal intro:";

  const pitches: PitchTemplate[] = [
    {
      title: DEFAULT_PITCH_CHANNELS[0].title,
      channel: DEFAULT_PITCH_CHANNELS[0].channel,
      body: `${toneOpener} I built ${valueProp.split(".")[0]}. I'm applying for ${role} at ${company} and think I can help ${contact} ship faster. Open to a 15-min chat this week?`,
      copyTip: "Send Tuesday–Thursday morning; reply to a recent company post first for warm context.",
    },
    {
      title: DEFAULT_PITCH_CHANNELS[1].title,
      channel: DEFAULT_PITCH_CHANNELS[1].channel,
      body: `Subject: ${role} — proof-of-work intro for ${company}\n\nHi ${contact},\n\nI'm reaching out about the ${role} role at ${company}. ${valueProp}\n\nI'd welcome 15 minutes to walk through how that maps to your roadmap.\n\nBest,`,
      copyTip: "Keep subject under 50 characters and send from a professional email with portfolio link in signature.",
    },
    {
      title: DEFAULT_PITCH_CHANNELS[2].title,
      channel: DEFAULT_PITCH_CHANNELS[2].channel,
      body: `"Hi ${contact} — I'm applying for ${role} at ${company}. In 60 seconds: ${valueProp} I'll show the repo, the architecture decision, and the outcome metric. If this aligns with what you're building, I'd love to talk."`,
      copyTip: "Record in one take with screen share of your best project; keep it under 90 seconds.",
    },
  ];

  return { pitches };
}

async function generateGeminiPitches(
  body: PitchStudioRequestBody
): Promise<PitchStudioResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const userPrompt = JSON.stringify({
    targetCompany: body.targetCompany?.trim() ?? "",
    targetContactRole: body.targetContactRole?.trim() ?? "",
    roleApplyingFor: body.roleApplyingFor?.trim() ?? "",
    coreValueProp: (body.coreValueProp ?? "").slice(0, 3000),
    tone: body.tone?.trim() ?? "Direct & High Signal",
  });

  let lastError: unknown;

  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: PITCH_RESPONSE_SCHEMA,
          temperature: 0.45,
        },
      });

      const text = response.text?.trim();

      if (!text) {
        throw new Error(`Gemini (${model}) returned an empty response.`);
      }

      const normalized = normalizePitchResult(JSON.parse(text));

      if (normalized.pitches.length < 3) {
        throw new Error(`Gemini (${model}) returned fewer than 3 pitches.`);
      }

      return normalized;
    } catch (error) {
      lastError = error;
      console.error(`Gemini pitch-studio failed for model ${model}:`, error);
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
          "Provide at least a target company, role applying for, or core value prop.",
      },
      { status: 400 }
    );
  }

  const payload = body as PitchStudioRequestBody;

  try {
    const result = await generateGeminiPitches(payload);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Gemini pitch-studio API failed, using fallback:", error);
    return NextResponse.json(buildFallbackPitches(payload));
  }
}
