export const EXPERIENCE_LEVEL_OPTIONS = [
  "Student / Intern",
  "Junior / Entry-Level",
  "Mid-Level",
  "Senior+",
] as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVEL_OPTIONS)[number];

export const DEFAULT_EXPERIENCE_LEVEL: ExperienceLevel = "Junior / Entry-Level";
