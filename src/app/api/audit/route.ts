import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import {
  DAILY_LIMIT_API_MESSAGE,
  incrementDailyScanUsage,
  loadDailyScanUsage,
  resolveDailyScanUsage,
  type DailyScanUsage,
} from "@/lib/daily-scan-limit";
import {
  consumeRateLimit,
  getRequestIp,
  tooManyRequestsResponse,
} from "@/lib/ip-rate-limit";
import { createClient } from "@/utils/supabase/server";

export type AuditRequestBody = {
  targetRole?: string;
  githubUrl?: string;
  resumeSummary?: string;
  compensationLevel?: string;
};

export type AuditResult = {
  score: number;
  strengths: string[];
  redFlags: string[];
  recommendations: string[];
};

const SYSTEM_PROMPT = `You are Provix's GitHub & Resume Credibility Auditor.

Evaluate whether a candidate's stated role, GitHub presence, and resume/experience summary demonstrate credible proof-of-work for founders and hiring managers.

Return strict JSON only:
{
  "score": number (integer 1-100, hiring readiness),
  "strengths": ["verified strength with evidence", "..."],
  "redFlags": ["missing proof or credibility gap", "..."],
  "recommendations": ["specific actionable fix", "...", "..."]
}

Rules:
- score: 1-100 integer reflecting overall hiring readiness for the target role and level.
- strengths: 3-5 bullets citing concrete signals from GitHub URL and/or resume text when provided.
- redFlags: 2-5 bullets flagging gaps, vague claims, missing artifacts, or timeline inconsistencies.
- recommendations: exactly 3 specific, actionable steps to stand out to founders (not generic advice).
- Be skeptical but fair. If GitHub URL is missing, note that in redFlags. If resume is thin, score accordingly.
- No markdown, no extra keys.`;

const AUDIT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    score: {
      type: Type.INTEGER,
      description: "Overall hiring readiness score from 1 to 100.",
    },
    strengths: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    redFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    recommendations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ["score", "strengths", "redFlags", "recommendations"],
};

const MODEL_CANDIDATES = [
  "gemini-1.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-3.6-flash",
] as const;

function clampScore(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return 72;
  }

  return Math.min(100, Math.max(1, Math.round(numeric)));
}

function normalizeStringArray(value: unknown, maxItems = 6): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeAuditResult(raw: unknown): AuditResult {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const recommendations = normalizeStringArray(record.recommendations, 3);

  return {
    score: clampScore(record.score),
    strengths: normalizeStringArray(record.strengths, 5),
    redFlags: normalizeStringArray(record.redFlags, 5),
    recommendations:
      recommendations.length >= 3
        ? recommendations.slice(0, 3)
        : [
            ...recommendations,
            "Add a public GitHub repo with README, architecture notes, and recent commits.",
            "Quantify resume bullets with metrics, scope, and verifiable links.",
            "Align project stack keywords with the target role in your headline and bio.",
          ].slice(0, 3),
  };
}

function isValidRequestBody(body: unknown): body is AuditRequestBody {
  if (!body || typeof body !== "object") {
    return false;
  }

  const record = body as AuditRequestBody;
  const hasContent =
    !!record.targetRole?.trim() ||
    !!record.githubUrl?.trim() ||
    !!record.resumeSummary?.trim();

  return hasContent;
}

function buildFallbackAudit(body: AuditRequestBody): AuditResult {
  const hasGithub = !!body.githubUrl?.trim();
  const hasResume = !!body.resumeSummary?.trim();
  const role = body.targetRole?.trim() || "your target role";
  const level = body.compensationLevel?.trim() || "Mid";

  let score = 58;
  const strengths: string[] = [];
  const redFlags: string[] = [];
  const recommendations: string[] = [];

  if (hasResume) {
    score += 12;
    strengths.push(
      "Resume summary provides material to evaluate claimed experience and scope."
    );
  } else {
    redFlags.push("No resume or experience summary provided for proof-of-work review.");
  }

  if (hasGithub) {
    score += 15;
    strengths.push(
      `GitHub URL supplied — reviewers can trace repository activity for ${role}.`
    );
  } else {
    redFlags.push(
      "Missing GitHub profile or repository URL limits artifact verification."
    );
  }

  if (body.targetRole?.trim()) {
    score += 5;
    strengths.push(`Target role "${role}" gives reviewers a clear evaluation lens.`);
  }

  recommendations.push(
    `Pin 1-2 production repos that map directly to ${level}-level ${role} expectations.`,
    "Rewrite top resume bullets with metrics, stack tags, and links to live demos or PRs.",
    "Add a concise README per repo covering architecture, your contributions, and setup steps.",
  );

  if (strengths.length === 0) {
    strengths.push("Profile inputs give a baseline starting point for a credibility audit.");
  }

  return normalizeAuditResult({
    score,
    strengths,
    redFlags,
    recommendations,
  });
}

async function generateGeminiAudit(body: AuditRequestBody): Promise<AuditResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const userPrompt = JSON.stringify({
    targetRole: body.targetRole?.trim() ?? "",
    githubUrl: body.githubUrl?.trim() ?? "",
    resumeSummary: (body.resumeSummary ?? "").slice(0, 4000),
    compensationLevel: body.compensationLevel?.trim() ?? "Mid",
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
          responseSchema: AUDIT_RESPONSE_SCHEMA,
          temperature: 0.25,
        },
      });

      const text = response.text?.trim();

      if (!text) {
        throw new Error(`Gemini (${model}) returned an empty response.`);
      }

      return normalizeAuditResult(JSON.parse(text));
    } catch (error) {
      lastError = error;
      console.error(`Gemini audit failed for model ${model}:`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Gemini models failed.");
}

async function resolveAuditAccess(): Promise<
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      user: { id: string } | null;
      usage: DailyScanUsage;
    }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: true,
      supabase,
      user: null,
      usage: resolveDailyScanUsage(0, null),
    };
  }

  const { usage, error } = await loadDailyScanUsage(supabase, user.id);

  if (error) {
    console.error("[audit] failed to load daily scan usage:", error);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Could not verify daily scan limit." },
        { status: 500 }
      ),
    };
  }

  return { ok: true, supabase, user, usage };
}

export async function GET() {
  const access = await resolveAuditAccess();

  if (!access.ok) {
    return access.response;
  }

  return NextResponse.json(access.usage);
}

export async function POST(request: Request) {
  const access = await resolveAuditAccess();

  if (!access.ok) {
    return access.response;
  }

  if (!access.user) {
    const guestLimit = consumeRateLimit(
      `audit-guest:${getRequestIp(request)}`,
      8,
      60 * 60 * 1000
    );
    if (!guestLimit.ok) {
      return tooManyRequestsResponse(guestLimit.retryAfterSec);
    }
  }

  if (access.user && access.usage.limit_reached) {
    return NextResponse.json(
      { error: DAILY_LIMIT_API_MESSAGE, ...access.usage },
      { status: 429 }
    );
  }

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
          "Provide at least a target role, GitHub URL, or resume summary to audit.",
      },
      { status: 400 }
    );
  }

  const payload = body as AuditRequestBody;

  let result: AuditResult;

  try {
    result = await generateGeminiAudit(payload);
  } catch (error) {
    console.error("Gemini audit API failed, using fallback:", error);
    result = buildFallbackAudit(payload);
  }

  const usage = access.user
    ? await incrementDailyScanUsage(
        access.supabase,
        access.user.id,
        access.usage
      )
    : access.usage;

  return NextResponse.json({ ...result, ...usage });
}
