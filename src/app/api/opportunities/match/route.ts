import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { fetchGitHubAudit } from "@/lib/github-audit";
import { requireAiApiAccess } from "@/lib/api-auth";
import {
  buildFallbackOpportunityMatch,
  normalizeOpportunityMatchResult,
  type OpportunityMatchCandidatePayload,
  type OpportunityMatchJobPayload,
} from "@/lib/opportunity-match";
import { normalizeStringArray } from "@/lib/match-heuristic";

export type { OpportunityMatchResult } from "@/lib/opportunity-match";

const SYSTEM_PROMPT = `You are Provix's candidate opportunity matching engine.

Evaluate how well a verified candidate fits an open job using:
- Candidate skills, role_type, bio, and experience level
- Optional live GitHub repository audit (language, commits, README, stars)
- Job title, company, tech stack, required skills, location, and description

Return strict JSON only:
{
  "match_score": integer 0-100,
  "fit_verdict": "Strong Fit" | "Moderate Fit" | "Growth Fit",
  "match_reasons": ["reason1", "reason2", "reason3"]
}

Rules:
- match_score: 0-100 integer reflecting overall fit for THIS job.
- fit_verdict: Strong Fit (75-100), Moderate Fit (50-74), Growth Fit (0-49).
- match_reasons: exactly 2-3 concise second-person bullets (You/Your), each under 22 words.
- Name specific overlapping skills, GitHub language/repo/commits when present, and missing required skills. Never invent evidence.
- Never write generic filler such as "your profile signals align" or "partially overlap with this role's stack".
- No markdown, no extra keys.`;

const MATCH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    match_score: {
      type: Type.INTEGER,
      description: "Overall fit score from 0 to 100.",
    },
    fit_verdict: {
      type: Type.STRING,
      description:
        'One of "Strong Fit", "Moderate Fit", or "Growth Fit".',
    },
    match_reasons: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Two or three concise match reasons in second person.",
    },
  },
  required: ["match_score", "fit_verdict", "match_reasons"],
};

const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
] as const;

function isValidRequestBody(
  body: unknown
): body is {
  candidate: OpportunityMatchCandidatePayload;
  job: OpportunityMatchJobPayload;
} {
  if (!body || typeof body !== "object") {
    return false;
  }

  const record = body as {
    candidate?: OpportunityMatchCandidatePayload;
    job?: OpportunityMatchJobPayload;
  };

  return (
    !!record.candidate &&
    typeof record.candidate === "object" &&
    !!record.job &&
    typeof record.job === "object"
  );
}

function resolveGitHubUrl(
  candidate: OpportunityMatchCandidatePayload
): string | null {
  const url = candidate.github_url?.trim();
  if (!url) {
    return null;
  }

  return url.toLowerCase().includes("github.com")
    ? url.startsWith("http")
      ? url
      : `https://${url}`
    : null;
}

async function generateGeminiOpportunityMatch(
  apiKey: string,
  candidate: OpportunityMatchCandidatePayload,
  job: OpportunityMatchJobPayload,
  githubAudit: Awaited<ReturnType<typeof fetchGitHubAudit>>
) {
  const ai = new GoogleGenAI({ apiKey });

  const userPrompt = JSON.stringify({
    candidate: {
      title: candidate.title ?? "",
      role_type: candidate.role_type ?? "",
      bio: (candidate.bio ?? "").slice(0, 400),
      skills: normalizeStringArray(candidate.skills),
      experience_level: candidate.experience_level ?? "",
      github_url: candidate.github_url ?? "",
    },
    job: {
      title: job.title ?? "",
      company: job.company ?? "",
      techStack: normalizeStringArray(job.techStack ?? job.tech_stack),
      requiredSkills: normalizeStringArray(
        job.requiredSkills ?? job.required_skills
      ),
      tags: normalizeStringArray(job.tags),
      location: job.location ?? "",
      description: (job.description ?? "").slice(0, 400),
      salary_range: job.salary_range ?? "",
    },
    github_audit: githubAudit
      ? {
          owner: githubAudit.owner,
          repo: githubAudit.repo,
          language: githubAudit.language,
          stars: githubAudit.stars,
          forks: githubAudit.forks,
          commit_count_sampled: githubAudit.commit_count_sampled,
          readme_excerpt: (githubAudit.readme_excerpt ?? "").slice(0, 600),
          fetch_warnings: githubAudit.fetch_warnings,
        }
      : null,
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
          responseSchema: MATCH_RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      });

      const text = response.text?.trim();
      if (!text) {
        throw new Error(`Gemini (${model}) returned an empty response.`);
      }

      return normalizeOpportunityMatchResult(JSON.parse(text));
    } catch (error) {
      lastError = error;
      console.error(`Gemini opportunity match failed for model ${model}:`, error);
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
      {
        error:
          "Request body must include candidate and job objects with the expected fields.",
      },
      { status: 400 }
    );
  }

  const { candidate, job } = body;
  const githubUrl = resolveGitHubUrl(candidate);
  let githubAudit = null;

  if (githubUrl) {
    try {
      githubAudit = await fetchGitHubAudit(githubUrl);
    } catch (error) {
      console.warn("GitHub audit fetch failed for opportunity match:", error);
    }
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      "GEMINI_API_KEY is not configured — using heuristic fallback for opportunity match."
    );
    return NextResponse.json(
      buildFallbackOpportunityMatch(candidate, job, githubAudit)
    );
  }

  try {
    const result = await generateGeminiOpportunityMatch(
      apiKey,
      candidate,
      job,
      githubAudit
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error(
      "Gemini opportunity match API failed, using fallback:",
      error
    );
    return NextResponse.json(
      buildFallbackOpportunityMatch(candidate, job, githubAudit)
    );
  }
}
