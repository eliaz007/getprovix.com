export const MAX_EDUCATION_ENTRIES = 3;
export const SELF_TAUGHT_ENGINEER_LABEL = "Self-Taught Engineer";
export const SELF_TAUGHT_CHECKBOX_LABEL =
  "I am a self-taught / non-traditional engineer";
export const SELF_TAUGHT_PROFILE_CONFIRMATION =
  "Displayed on your public profile as: Self-Taught Engineer";

export const CREDENTIAL_TYPE_OPTIONS = [
  "Bachelor's",
  "Master's/PhD",
  "Bootcamp/Certificate",
  "Associate",
  "Other",
] as const;

export type CredentialType = (typeof CREDENTIAL_TYPE_OPTIONS)[number];

export type EducationEntry = {
  id: string;
  institution: string;
  credentialType: CredentialType;
  fieldOfStudy: string;
  graduationYear: string;
};

const CREDENTIAL_TYPE_SET = new Set<string>(CREDENTIAL_TYPE_OPTIONS);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asTrimmedText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return typeof value === "string" ? value.trim() : "";
}

function newEducationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `edu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyEducationEntry(): EducationEntry {
  return {
    id: newEducationId(),
    institution: "",
    credentialType: "Bachelor's",
    fieldOfStudy: "",
    graduationYear: "",
  };
}

export function normalizeCredentialType(
  value: unknown
): CredentialType {
  const trimmed = asTrimmedText(value);
  if (CREDENTIAL_TYPE_SET.has(trimmed)) {
    return trimmed as CredentialType;
  }

  const lower = trimmed.toLowerCase();
  if (/phd|doctor|master/.test(lower)) {
    return "Master's/PhD";
  }
  if (/associate/.test(lower)) {
    return "Associate";
  }
  if (/bootcamp|certificate|certificat/.test(lower)) {
    return "Bootcamp/Certificate";
  }
  if (/bachelor|b\.s|b\.a|\bbs\b|\bba\b/.test(lower)) {
    return "Bachelor's";
  }

  return trimmed ? "Other" : "Bachelor's";
}

export function normalizeEducationEntry(value: unknown): EducationEntry | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const institution = asTrimmedText(
    record.institution ??
      record.university ??
      record.school ??
      record.program ??
      record.name
  );
  const fieldOfStudy = asTrimmedText(
    record.fieldOfStudy ??
      record.field_of_study ??
      record.major ??
      record.degree
  );
  const graduationYear = asTrimmedText(
    record.graduationYear ??
      record.graduation_year ??
      record.completionYear ??
      record.completion_year ??
      record.year
  );
  const credentialType = normalizeCredentialType(
    record.credentialType ?? record.credential_type ?? record.degreeType
  );

  if (!institution && !fieldOfStudy && !graduationYear) {
    return null;
  }

  return {
    id: asTrimmedText(record.id) || newEducationId(),
    institution,
    credentialType,
    fieldOfStudy,
    graduationYear,
  };
}

export function parseEducationEntries(
  value: unknown
): EducationEntry[] {
  if (!Array.isArray(value)) {
    const single = normalizeEducationEntry(value);
    return single ? [single] : [];
  }

  const seen = new Set<string>();
  const parsed: EducationEntry[] = [];

  for (const item of value) {
    const entry = normalizeEducationEntry(item);
    if (!entry) continue;

    const key = entry.id || `${entry.institution}:${entry.credentialType}:${entry.fieldOfStudy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push(entry);

    if (parsed.length >= MAX_EDUCATION_ENTRIES) {
      break;
    }
  }

  return parsed;
}

export function educationEntriesFromLegacyFields(input: {
  university?: string | null;
  school?: string | null;
  major?: string | null;
  degree?: string | null;
  graduationYear?: string | number | null;
}): EducationEntry[] {
  const institution = asTrimmedText(input.university) || asTrimmedText(input.school);
  const fieldOfStudy = asTrimmedText(input.major) || asTrimmedText(input.degree);
  const graduationYear = asTrimmedText(input.graduationYear);

  if (!institution && !fieldOfStudy && !graduationYear) {
    return [];
  }

  return [
    {
      id: newEducationId(),
      institution,
      credentialType: normalizeCredentialType(input.degree),
      fieldOfStudy,
      graduationYear,
    },
  ];
}

export function parseEducationFromProfileRow(
  row: Record<string, unknown> | null | undefined
): EducationEntry[] {
  if (!row) {
    return [];
  }

  const fromJson = parseEducationEntries(row.education);
  if (fromJson.length > 0) {
    return fromJson;
  }

  return educationEntriesFromLegacyFields({
    university: asTrimmedText(row.university),
    school: asTrimmedText(row.school),
    major: asTrimmedText(row.major),
    degree: asTrimmedText(row.degree),
    graduationYear: row.graduation_year as string | number | null,
  });
}

export function serializeEducationEntries(
  entries: EducationEntry[]
): Array<{
  id: string;
  institution: string;
  credentialType: CredentialType;
  fieldOfStudy: string;
  graduationYear: string;
}> {
  return parseEducationEntries(entries).map((entry) => ({
    id: entry.id,
    institution: entry.institution,
    credentialType: entry.credentialType,
    fieldOfStudy: entry.fieldOfStudy,
    graduationYear: entry.graduationYear,
  }));
}

export function parseIsSelfTaught(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

export function getEducationValidationError(
  entries: EducationEntry[] | unknown,
  options?: { isSelfTaught?: boolean }
): string | null {
  if (options?.isSelfTaught) {
    return null;
  }

  const parsed = parseEducationEntries(entries);
  if (parsed.length > MAX_EDUCATION_ENTRIES) {
    return "You can add up to 3 education entries.";
  }

  for (const entry of parsed) {
    if (!entry.institution) {
      return "Institution/Program name is required for each education entry.";
    }
  }

  return null;
}

export function primaryEducationFields(entries: EducationEntry[]): {
  institution: string;
  fieldOfStudy: string;
  credentialType: CredentialType | "";
  graduationYear: string;
} {
  const primary = parseEducationEntries(entries)[0];
  if (!primary) {
    return {
      institution: "",
      fieldOfStudy: "",
      credentialType: "",
      graduationYear: "",
    };
  }

  return {
    institution: primary.institution,
    fieldOfStudy: primary.fieldOfStudy,
    credentialType: primary.credentialType,
    graduationYear: primary.graduationYear,
  };
}

export function educationEntriesEqual(
  left: EducationEntry[] | unknown,
  right: EducationEntry[] | unknown
): boolean {
  const a = serializeEducationEntries(parseEducationEntries(left));
  const b = serializeEducationEntries(parseEducationEntries(right));
  if (a.length !== b.length) {
    return false;
  }

  return a.every((entry, index) => {
    const other = b[index];
    return (
      entry.institution === other?.institution &&
      entry.credentialType === other?.credentialType &&
      entry.fieldOfStudy === other?.fieldOfStudy &&
      entry.graduationYear === other?.graduationYear
    );
  });
}

export function formatEducationEntryLine(entry: EducationEntry): string {
  return [
    entry.institution,
    entry.credentialType,
    entry.fieldOfStudy,
    entry.graduationYear ? `Class of ${entry.graduationYear}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
