import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { requireAiApiAccess } from "@/lib/api-auth";
import {
  alignMatchesToJobs,
  buildFallbackMatches,
  buildInsufficientDataMatches,
  computeJobSkillOverlap,
  extractAuditedSkills,
  hasUsableCandidateMatchData,
  isGeminiRateLimitError,
  normalizeJobMatch,
  parseExperienceTier,
  parseJobListings,
  readRetryAfterSeconds,
  summarizeGithubAudit,
  type JobMatchCandidatePayload,
  type JobMatchResult,
  type ParsedJobListing,
} from "@/lib/job-match";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are Provix AI Job Match — a skill-matching engine for verified engineering candidates.

Cross-reference the candidate's audited GitHub skills and experience tier against each active job's tech stack, required skills, and description.

Return strict JSON only:
{
  "matches": [
    {
      "jobId": "the job's id, unchanged",
      "matchScore": 0-100,
      "matchingReasons": ["reason 1", "reason 2"]
    }
  ]
}

Rules:
- Return exactly one match object per job in the input, using the same jobId values.
- matchScore: integer 0-100 based on audited skill overlap with techStack and requiredSkills, experience-tier fit, and role description. Do not default to a mid-range score.
- matchingReasons: exactly 2-3 concise second-person bullets (You/Your). Each bullet must name a concrete overlapping skill, GitHub language/repo/commit signal, or missing required skill from the job payload. No markdown.
- Use overlappingSkills and missingSkills from the job payload when present. Never invent GitHub evidence or skills that are not in the candidate audit data.
- Prefer specific phrasing such as "Your React and TypeScript skills match this role's stack" or "This listing also asks for AWS, which is not in your audited skills."
- Never write generic filler such as "your profile signals align", "partially overlap with this role's stack", or "completing your GitHub audit can sharpen match accuracy".
- techStack may be empty for non-technical roles. Score those from requiredSkills, description, and experience tier.
- If a job has no required skills and no tech stack, score conservatively from the description and experience tier, and still name the candidate's actual skills.
- No extra keys.`;

const MATCH_JOBS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    matches: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          jobId: {
            type: Type.STRING,
            description: "The job id from the request, unchanged.",
          },
          matchScore: {
            type: Type.INTEGER,
            description: "Integer fit score from 0 to 100.",
          },
          matchingReasons: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              "Two or three specific bullets naming overlapping skills, GitHub evidence, or missing requirements.",
          },
        },
        required: ["jobId", "matchScore", "matchingReasons"],
      },
    },
  },
  required: ["matches"],
};

const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
] as const;

const GEMINI_RATE_LIMIT_RETRY_MS = 1000;

type MatchJobsRequestBody = {
  candidate?: JobMatchCandidatePayload;
  jobs?: unknown;
};

function isValidRequestBody(body: unknown): body is MatchJobsRequestBody {
  if (!body || typeof body !== "object") {
    return false;
  }

  const record = body as MatchJobsRequestBody;
  return Array.isArray(record.jobs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateGeminiJobMatches(
  apiKey: string,
  candidate: JobMatchCandidatePayload,
  jobs: ParsedJobListing[]
): Promise<JobMatchResult> {
  const ai = new GoogleGenAI({ apiKey });
  const skills = extractAuditedSkills(candidate);
  const experienceTier = parseExperienceTier(candidate);

  const userPrompt = JSON.stringify({
    candidate: {
      auditedSkills: skills,
      experienceTier,
      githubUrl: candidate.githubUrl?.trim() || candidate.github_url?.trim() || "",
      githubAudit: summarizeGithubAudit(candidate.githubAudit),
    },
    jobs: jobs.map((job) => {
      const { overlapping, missing } = computeJobSkillOverlap(skills, job);
      return {
        jobId: String(job.jobId),
        title: job.title,
        company: job.company,
        techStack: job.techStack,
        requiredSkills: job.requiredSkills,
        overlappingSkills: overlapping,
        missingSkills: missing,
        description: job.description.slice(0, 500),
      };
    }),
  });

  let lastError: unknown;
  let rateLimited = false;
  let retryAfterSec = 30;

  for (const model of MODEL_CANDIDATES) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: MATCH_JOBS_RESPONSE_SCHEMA,
            temperature: 0,
          },
        });

        const text = response.text?.trim();
        if (!text) {
          throw new Error(`Gemini (${model}) returned an empty response.`);
        }

        const parsed = JSON.parse(text) as unknown;
        const record =
          parsed && typeof parsed === "object"
            ? (parsed as Record<string, unknown>)
            : {};
        const rawMatches = Array.isArray(record.matches) ? record.matches : [];

        return {
          matches: alignMatchesToJobs(
            rawMatches.map((item, index) =>
              normalizeJobMatch(item, jobs[index]?.jobId ?? index)
            ),
            jobs,
            candidate
          ),
        };
      } catch (error) {
        lastError = error;
        console.error(
          `Gemini job match failed for model ${model} (attempt ${attempt + 1}):`,
          error
        );

        if (isGeminiRateLimitError(error)) {
          rateLimited = true;
          retryAfterSec = readRetryAfterSeconds(error, retryAfterSec);
          if (attempt === 0) {
            await sleep(GEMINI_RATE_LIMIT_RETRY_MS);
            continue;
          }
          break;
        }

        break;
      }
    }
  }

  if (rateLimited) {
    const error = new Error("Gemini rate limit exceeded.");
    (error as Error & { status: number; retryAfter: number }).status = 429;
    (error as Error & { status: number; retryAfter: number }).retryAfter =
      retryAfterSec;
    throw error;
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
          "Request body must include a jobs array and candidate object with audited skills and experience tier.",
      },
      { status: 400 }
    );
  }

  const candidate = body.candidate ?? {};
  const jobs = parseJobListings(body.jobs);

  if (jobs.length === 0) {
    return NextResponse.json({ matches: [] } satisfies JobMatchResult);
  }

  if (!hasUsableCandidateMatchData(candidate)) {
    return NextResponse.json({
      matches: buildInsufficientDataMatches(jobs),
    } satisfies JobMatchResult);
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      "GEMINI_API_KEY is not configured — using heuristic fallback for job match."
    );
    return NextResponse.json({
      matches: buildFallbackMatches(candidate, jobs),
    } satisfies JobMatchResult);
  }

  try {
    const result = await generateGeminiJobMatches(apiKey, candidate, jobs);
    return NextResponse.json(result);
  } catch (error) {
    if (isGeminiRateLimitError(error)) {
      const retryAfterSec = readRetryAfterSeconds(error);
      console.warn("Gemini job match rate-limited, returning fallback matches.");
      return NextResponse.json(
        {
          error: "Too many requests. Try again shortly.",
          matches: buildFallbackMatches(candidate, jobs),
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSec) },
        }
      );
    }

    console.error("Gemini job match API failed, using fallback:", error);
    return NextResponse.json({
      matches: buildFallbackMatches(candidate, jobs),
    } satisfies JobMatchResult);
  }
}
