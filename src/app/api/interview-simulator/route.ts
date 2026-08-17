import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

export type InterviewSimulatorRequestBody = {
  targetJobTitle?: string;
  coreTechStack?: string;
  interviewRound?: string;
  companyType?: string;
};

export type InterviewQuestion = {
  question: string;
  idealAnswer: string;
  talkingPoints: string[];
};

export type InterviewSimulatorResult = {
  questions: InterviewQuestion[];
  technicalTrap: string;
  closingQuestion: string;
};

const SYSTEM_PROMPT = `You are Provix's Interview Simulator — a rigorous hiring manager coach for technical and architecture interviews.

Given a target job title, core tech stack, interview round, and company type, generate a realistic interview simulation cheat sheet.

Return strict JSON only:
{
  "questions": [
    {
      "question": "Interview question tailored to role, stack, and round",
      "idealAnswer": "Strong sample answer structure the candidate should aim for",
      "talkingPoints": ["key point 1", "key point 2", "key point 3"]
    }
  ],
  "technicalTrap": "The top technical trap or pitfall to avoid in this round",
  "closingQuestion": "One smart question the candidate should ask the interviewer at the end"
}

Rules:
- questions: exactly 4 objects, ordered from foundational to deeper.
- Tailor difficulty and focus to the interview round:
  * Initial Technical Screen — coding fundamentals, stack fluency, debugging, API/data basics.
  * System Design & Architecture — scalability, tradeoffs, data modeling, reliability, component boundaries.
  * Behavioral & Culture Fit — ownership, ambiguity, collaboration, startup/enterprise context.
- Adapt tone and expectations to company type (Early-Stage Startup, High-Growth Scaleup, Enterprise).
- idealAnswer: concise but substantive — show structure, not fluff.
- talkingPoints: 2-4 bullets per question highlighting what graders listen for.
- technicalTrap: one specific, actionable pitfall (not generic "don't be nervous").
- closingQuestion: thoughtful, role-specific, shows seniority and curiosity.
- No markdown, no extra keys.`;

const INTERVIEW_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          idealAnswer: { type: Type.STRING },
          talkingPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["question", "idealAnswer", "talkingPoints"],
      },
    },
    technicalTrap: { type: Type.STRING },
    closingQuestion: { type: Type.STRING },
  },
  required: ["questions", "technicalTrap", "closingQuestion"],
};

const MODEL_CANDIDATES = [
  "gemini-1.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-3.6-flash",
] as const;

function normalizeStringArray(value: unknown, maxItems = 4): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeQuestion(item: unknown): InterviewQuestion | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const record = item as Record<string, unknown>;
  const question =
    typeof record.question === "string" ? record.question.trim() : "";
  const idealAnswer =
    typeof record.idealAnswer === "string" ? record.idealAnswer.trim() : "";

  if (!question) {
    return null;
  }

  return {
    question,
    idealAnswer:
      idealAnswer ||
      "Open with context, explain your approach, tradeoffs, and a concrete example from past work.",
    talkingPoints: normalizeStringArray(record.talkingPoints, 4),
  };
}

function normalizeInterviewResult(raw: unknown): InterviewSimulatorResult {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const questions = Array.isArray(record.questions)
    ? record.questions
        .map(normalizeQuestion)
        .filter((item): item is InterviewQuestion => item !== null)
        .slice(0, 4)
    : [];

  const technicalTrap =
    typeof record.technicalTrap === "string" && record.technicalTrap.trim()
      ? record.technicalTrap.trim()
      : "Avoid hand-waving on tradeoffs — interviewers penalize vague answers without constraints or metrics.";

  const closingQuestion =
    typeof record.closingQuestion === "string" && record.closingQuestion.trim()
      ? record.closingQuestion.trim()
      : "What does success look like in the first 90 days for this role on your team?";

  return {
    questions,
    technicalTrap,
    closingQuestion,
  };
}

function isValidRequestBody(
  body: unknown
): body is InterviewSimulatorRequestBody {
  if (!body || typeof body !== "object") {
    return false;
  }

  const record = body as InterviewSimulatorRequestBody;
  return !!record.targetJobTitle?.trim() || !!record.coreTechStack?.trim();
}

function buildFallbackInterview(
  body: InterviewSimulatorRequestBody
): InterviewSimulatorResult {
  const title = body.targetJobTitle?.trim() || "Software Engineer";
  const stack = body.coreTechStack?.trim() || "TypeScript, APIs, databases";
  const round = body.interviewRound?.trim() || "Initial Technical Screen";
  const company = body.companyType?.trim() || "Early-Stage Startup";

  const isSystemDesign = round.includes("System Design");
  const isBehavioral = round.includes("Behavioral");

  let questions: InterviewQuestion[];

  if (isSystemDesign) {
    questions = [
      {
        question: `Design a service for ${title} responsibilities using ${stack}. How would you handle read-heavy traffic?`,
        idealAnswer:
          "Clarify requirements, estimate scale, propose layered architecture (CDN/cache, app tier, DB), discuss read replicas or caching strategy, and note tradeoffs.",
        talkingPoints: [
          "Ask clarifying questions before designing",
          "Quantify scale assumptions",
          "Separate hot path from admin/analytics reads",
        ],
      },
      {
        question: "Where would you draw service boundaries, and what belongs in a shared library vs a microservice?",
        idealAnswer:
          "Bound by change frequency and team ownership; shared libs for pure utilities, services for deployable business capabilities with clear APIs.",
        talkingPoints: [
          "Domain-driven boundaries",
          "Avoid premature microservices",
          "Contract/versioning between services",
        ],
      },
      {
        question: "How do you ensure reliability when a downstream dependency fails?",
        idealAnswer:
          "Timeouts, retries with jitter, circuit breakers, graceful degradation, idempotency, and observability on error budgets.",
        talkingPoints: [
          "Fail fast with bounded retries",
          "User-visible fallback paths",
          "Metrics and alerting on SLOs",
        ],
      },
      {
        question: `How would schema or API evolution work as ${company} scales product scope?`,
        idealAnswer:
          "Backward-compatible API versioning, expand-contract migrations, feature flags, and staged rollouts with rollback plans.",
        talkingPoints: [
          "Zero-downtime migrations",
          "Versioned public contracts",
          "Coordination across teams",
        ],
      },
    ];
  } else if (isBehavioral) {
    questions = [
      {
        question: `Tell me about a time you shipped under ambiguity as a ${title}.`,
        idealAnswer:
          "Situation with unclear requirements, actions you took to reduce ambiguity, stakeholder alignment, outcome with metric, and lesson learned.",
        talkingPoints: [
          "STAR structure",
          "Specific decision you owned",
          "Measurable result",
        ],
      },
      {
        question: `How do you collaborate with non-engineers at a ${company}?`,
        idealAnswer:
          "Translate technical tradeoffs into business impact, set expectations early, document decisions, and iterate with feedback loops.",
        talkingPoints: [
          "Clear communication cadence",
          "Written decision records",
          "Empathy for business constraints",
        ],
      },
      {
        question: "Describe a mistake you made in production and how you handled it.",
        idealAnswer:
          "Own the incident, communicate timeline, mitigate user impact, root-cause analysis, and preventive follow-ups.",
        talkingPoints: [
          "Accountability without blame",
          "Postmortem culture",
          "Systemic fixes",
        ],
      },
      {
        question: "Why this role and company type now?",
        idealAnswer:
          "Connect your proof-of-work to their stage, explain what you want to learn, and show you've researched their product and constraints.",
        talkingPoints: [
          "Authentic motivation",
          "Stage-fit (speed vs process)",
          "Growth alignment",
        ],
      },
    ];
  } else {
    questions = [
      {
        question: `Walk me through how you'd build a feature end-to-end with ${stack}.`,
        idealAnswer:
          "Requirements → API contract → data model → implementation → tests → deployment → monitoring, calling out stack-specific choices.",
        talkingPoints: [
          "Structured delivery process",
          "Testing strategy",
          "Operational readiness",
        ],
      },
      {
        question: "How would you debug a slow API endpoint in production?",
        idealAnswer:
          "Check metrics/traces, reproduce locally, profile DB queries, inspect N+1 or missing indexes, validate caching, roll out fix with verification.",
        talkingPoints: [
          "Observability first",
          "Hypothesis-driven debugging",
          "Safe rollout",
        ],
      },
      {
        question: `Explain a tradeoff you made when choosing tools from ${stack}.`,
        idealAnswer:
          "State options, constraints, decision criteria, chosen approach, and what you'd revisit at higher scale.",
        talkingPoints: [
          "Explicit tradeoffs",
          "Context-dependent choices",
          "Future scalability",
        ],
      },
      {
        question: "How do you write tests for a critical user flow?",
        idealAnswer:
          "Unit tests for logic, integration tests for API/DB boundaries, one happy-path e2e, and edge cases for auth/validation failures.",
        talkingPoints: [
          "Test pyramid balance",
          "Deterministic fixtures",
          "CI gating",
        ],
      },
    ];
  }

  return normalizeInterviewResult({
    questions,
    technicalTrap: isSystemDesign
      ? "Jumping to microservices before defining load, consistency, and team boundaries — interviewers want pragmatic scaling, not buzzwords."
      : isBehavioral
        ? "Giving polished but unverifiable stories without metrics, scope, or your specific contribution."
        : `Name-dropping ${stack} without explaining how you'd use each tool under ${company} constraints.`,
    closingQuestion: isSystemDesign
      ? "What are the top two scalability bottlenecks your team is actively designing around this quarter?"
      : isBehavioral
        ? "How does your engineering team define ownership and success in the first 90 days?"
        : "What would you expect me to ship in my first 30 days that would clearly add value?",
  });
}

async function generateGeminiInterview(
  body: InterviewSimulatorRequestBody
): Promise<InterviewSimulatorResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const userPrompt = JSON.stringify({
    targetJobTitle: body.targetJobTitle?.trim() ?? "",
    coreTechStack: body.coreTechStack?.trim() ?? "",
    interviewRound: body.interviewRound?.trim() ?? "Initial Technical Screen",
    companyType: body.companyType?.trim() ?? "Early-Stage Startup",
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
          responseSchema: INTERVIEW_RESPONSE_SCHEMA,
          temperature: 0.35,
        },
      });

      const text = response.text?.trim();

      if (!text) {
        throw new Error(`Gemini (${model}) returned an empty response.`);
      }

      const normalized = normalizeInterviewResult(JSON.parse(text));

      if (normalized.questions.length < 4) {
        throw new Error(`Gemini (${model}) returned fewer than 4 questions.`);
      }

      return normalized;
    } catch (error) {
      lastError = error;
      console.error(`Gemini interview-simulator failed for model ${model}:`, error);
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
          "Provide at least a target job title or core tech stack to simulate.",
      },
      { status: 400 }
    );
  }

  const payload = body as InterviewSimulatorRequestBody;

  try {
    const result = await generateGeminiInterview(payload);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Gemini interview-simulator API failed, using fallback:", error);
    return NextResponse.json(buildFallbackInterview(payload));
  }
}
