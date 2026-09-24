import { z } from "zod";

export const MIN_CORE_SKILLS = 1;
export const MAX_CORE_SKILLS = 3;

export const CORE_SKILL_OPTIONS = [
  "React",
  "TypeScript",
  "Next.js",
  "Node.js",
  "Python",
  "Go",
  "Rust",
  "Java",
  "C++",
  "SQL",
  "PostgreSQL",
  "AWS",
  "Docker",
  "Kubernetes",
  "Machine Learning",
  "PyTorch",
  "Swift",
  "React Native",
  "Terraform",
  "GraphQL",
] as const;

export type CoreSkill = (typeof CORE_SKILL_OPTIONS)[number];

const CORE_SKILL_LOOKUP = new Map(
  CORE_SKILL_OPTIONS.map((skill) => [skill.toLowerCase(), skill])
);

export const CANDIDATE_SKILLS_PLACEHOLDER = "Search or type a skill (max 3)...";
export const CANDIDATE_SKILLS_LIMIT_TEXT =
  "Maximum of 3 specializations selected";
export const CANDIDATE_SKILLS_HELPER_TEXT = CANDIDATE_SKILLS_LIMIT_TEXT;

export const candidateSkillsSchema = z
  .array(z.string().trim().min(1))
  .min(MIN_CORE_SKILLS, "Select at least 1 core specialization.")
  .max(MAX_CORE_SKILLS, CANDIDATE_SKILLS_LIMIT_TEXT);

export function parseCandidateSkills(
  skills: string[] | string | null | undefined
): string[] {
  const raw = Array.isArray(skills)
    ? skills
    : typeof skills === "string"
      ? skills.split(",")
      : [];

  const seen = new Set<string>();
  const parsed: string[] = [];

  for (const value of raw) {
    const trimmed = value.trim();
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push(CORE_SKILL_LOOKUP.get(key) ?? trimmed);
  }

  return parsed;
}

export function limitCandidateSkills(
  skills: string[] | string | null | undefined
): string[] {
  return parseCandidateSkills(skills).slice(0, MAX_CORE_SKILLS);
}

export function canonicalizeSkillLabel(value: string): string | null {
  const parsed = parseCandidateSkills([value]);
  return parsed[0] ?? null;
}

export function filterSkillSuggestions(
  query: string,
  selected: string[]
): string[] {
  const selectedKeys = new Set(
    selected.map((skill) => skill.trim().toLowerCase()).filter(Boolean)
  );
  const needle = query.trim().toLowerCase();

  return CORE_SKILL_OPTIONS.filter((option) => {
    if (selectedKeys.has(option.toLowerCase())) {
      return false;
    }

    if (!needle) {
      return true;
    }

    return option.toLowerCase().includes(needle);
  });
}

export function getCandidateSkillsValidationError(
  skills: string[] | string | null | undefined
): string | null {
  const result = candidateSkillsSchema.safeParse(parseCandidateSkills(skills));
  if (result.success) {
    return null;
  }

  return result.error.issues[0]?.message ?? CANDIDATE_SKILLS_HELPER_TEXT;
}

export function candidateSkillsEqual(
  left: string[] | string | null | undefined,
  right: string[] | string | null | undefined
): boolean {
  const a = parseCandidateSkills(left);
  const b = parseCandidateSkills(right);
  if (a.length !== b.length) {
    return false;
  }

  return a.every((skill, index) => skill === b[index]);
}
