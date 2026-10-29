import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import { InterviewSimulatorRequestBody } from "./interviewsimulatorrequestbody";
import { InterviewQuestion } from "./interviewquestion";
import { InterviewSimulatorResult } from "./interviewsimulatorresult";
import { normalizeInterviewResult } from "./normalizeinterviewresult";

export function buildFallbackInterview(
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
