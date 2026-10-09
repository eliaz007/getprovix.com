import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAiApiAccess } from "@/lib/api-auth";
import {
  alignMatchesToJobs,
  buildFallbackMatches,
  buildInsufficientDataMatches,
  computeJobSkillOverlap,
  extractAuditedSkills,
  filterJobsForAvailabilityMatch,
  hasUsableCandidateMatchData,
  isGeminiRateLimitError,
  normalizeJobMatch,
  parseExperienceTier,
  parseJobListings,
  rankJobMatchesByFitAndAudit,
  readRetryAfterSeconds,
  resolveCandidateAuditScore,
  resolveCandidateAvailability,
  summarizeGithubAudit,
  type JobMatchCandidatePayload,
  type JobMatchResult,
  type ParsedJobListing,
} from "@/lib/job-match";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import type { JobWorkType } from "@/lib/jobs";

export const maxDuration = 60;

const matchJobsRequestBodySchema = z.object({
  candidate: z.looseObject({}).optional(),
  jobs: z.array(z.unknown()),
});

const SYSTEM_PROMPT = `You are Provix AI Job Match — a skill-matching engine for verified engineering candidates.

Cross-reference the candidate's audited GitHub skills, experience tier, availability preferences, and audit score against each active job's tech stack, required skills, employment type, and description.

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
- matchScore: integer 0-100 based on audited skill overlap with techStack and requiredSkills, experience-tier fit, employment-type fit, audit-score confidence, and role description. Do not default to a mid-range score.
- matchingReasons: exactly 2-3 concise second-person bullets (You/Your). Each bullet must name a concrete overlapping skill, GitHub language/repo/commit signal, or missing required skill from the job payload. No markdown.
- Use overlappingSkills and missingSkills from the job payload when present. Never invent GitHub evidence or skills that are not in the candidate audit data.
- Prefer specific phrasing such as "Your React and TypeScript skills match this role's stack" or "This listing also asks for AWS, which is not in your audited skills."
- Never write generic filler such as "your profile signals align", "partially overlap with this role's stack", or "completing your GitHub audit can sharpen match accuracy".
- Jobs are already filtered to the candidate's open_to_fulltime / open_to_contract preferences and active tab. Respect each job's workType (fulltime vs contract) when explaining fit.
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

  const availability = resolveCandidateAvailability(candidate);
  const auditScore = resolveCandidateAuditScore(candidate);

  const userPrompt = JSON.stringify({
    candidate: {
      auditedSkills: skills,
      experienceTier,
      githubUrl: candidate.githubUrl?.trim() || candidate.github_url?.trim() || "",
      githubAudit: summarizeGithubAudit(candidate.githubAudit),
      openToFulltime: availability.openToFulltime,
      openToContract: availability.openToContract,
      auditScore,
      preferredWorkType: candidate.preferredWorkType ?? null,
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
        workType: job.workType,
        employment_type: job.employment_type,
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

  const parsedBody = await parseJsonWithSchema(
    request,
    matchJobsRequestBodySchema
  );
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const candidate = (parsedBody.data.candidate ??
    {}) as JobMatchCandidatePayload;
  const preferredWorkType =
    (candidate.preferredWorkType as JobWorkType | undefined) ?? null;
  const availabilityFiltered = filterJobsForAvailabilityMatch(
    parseJobListings(parsedBody.data.jobs),
    candidate,
    preferredWorkType
  );

  if (availabilityFiltered.error) {
    return NextResponse.json({
      matches: [],
      error: availabilityFiltered.error,
    });
  }

  const jobs = availabilityFiltered.jobs;

  if (jobs.length === 0) {
    return NextResponse.json({ matches: [] } satisfies JobMatchResult);
  }

  if (!hasUsableCandidateMatchData(candidate)) {
    return NextResponse.json({
      matches: rankJobMatchesByFitAndAudit(
        buildInsufficientDataMatches(jobs),
        candidate
      ),
    } satisfies JobMatchResult);
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      "GEMINI_API_KEY is not configured — using heuristic fallback for job match."
    );
    return NextResponse.json({
      matches: rankJobMatchesByFitAndAudit(
        buildFallbackMatches(candidate, jobs),
        candidate
      ),
    } satisfies JobMatchResult);
  }

  try {
    const result = await generateGeminiJobMatches(apiKey, candidate, jobs);
    return NextResponse.json({
      matches: rankJobMatchesByFitAndAudit(result.matches, candidate),
    } satisfies JobMatchResult);
  } catch (error) {
    if (isGeminiRateLimitError(error)) {
      const retryAfterSec = readRetryAfterSeconds(error);
      console.warn("Gemini job match rate-limited, returning fallback matches.");
      return NextResponse.json(
        {
          error: "Too many requests. Try again shortly.",
          matches: rankJobMatchesByFitAndAudit(
            buildFallbackMatches(candidate, jobs),
            candidate
          ),
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSec) },
        }
      );
    }

    console.error("Gemini job match API failed, using fallback:", error);
    return NextResponse.json({
      matches: rankJobMatchesByFitAndAudit(
        buildFallbackMatches(candidate, jobs),
        candidate
      ),
    } satisfies JobMatchResult);
  }
}
