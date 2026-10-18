import { z } from "zod";

export const MAX_CANDIDATE_BIO_LENGTH = 350;

export const CANDIDATE_BIO_PLACEHOLDER =
  "e.g., Full-stack engineer specializing in Next.js, Node, and PostgreSQL. 4+ years building high-throughput SaaS with a focus on performant, well-tested code.";

export const CANDIDATE_BIO_LIMIT_TEXT =
  "Bio must be 350 characters or fewer.";

export const candidateBioSchema = z
  .string()
  .max(MAX_CANDIDATE_BIO_LENGTH, CANDIDATE_BIO_LIMIT_TEXT);

export function limitCandidateBio(value: string | null | undefined): string {
  return (value ?? "").slice(0, MAX_CANDIDATE_BIO_LENGTH);
}

export function getCandidateBioValidationError(
  value: string | null | undefined
): string | null {
  const result = candidateBioSchema.safeParse(value ?? "");
  if (result.success) {
    return null;
  }

  return result.error.issues[0]?.message ?? CANDIDATE_BIO_LIMIT_TEXT;
}

const STARTER_BIO_BY_EXPERIENCE: Record<string, string> = {
  "Student / Intern": "Aspiring software engineer",
  "Junior / Entry-Level":
    "Software engineer with 1–2 years of experience",
  "Mid-Level": "Software engineer with 3–5 years of experience",
  "Senior+": "Senior software engineer with 5+ years of experience",
};

/** Default bio when joining the talent network with an empty profile bio. */
export function buildStarterCandidateBio(input: {
  experienceLevel: string;
  primarySkills: string[];
}): string {
  const experiencePhrase =
    STARTER_BIO_BY_EXPERIENCE[input.experienceLevel.trim()] ??
    "Software engineer";
  const skills = input.primarySkills
    .map((skill) => skill.trim())
    .filter(Boolean)
    .join(", ");
  const body = skills
    ? `${experiencePhrase} specializing in ${skills}. Codebase verified on Provix.`
    : `${experiencePhrase}. Codebase verified on Provix.`;
  return limitCandidateBio(body);
}
