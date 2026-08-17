export type CandidateDiscipline =
  | "engineering"
  | "design"
  | "product"
  | "data"
  | "general";

export type CodenameAliasInput = {
  profileId: string;
  role?: string | null;
  jobTitle?: string | null;
  headline?: string | null;
  major?: string | null;
  skills?: string[] | null;
};

const DISCIPLINE_PREFIX: Record<CandidateDiscipline, string> = {
  engineering: "Engineer",
  design: "Designer",
  product: "Product Lead",
  data: "Data Scientist",
  general: "Specialist",
};

const ADJECTIVES = [
  "Cobalt",
  "Swift",
  "Prime",
  "Lunar",
  "Solar",
  "Nova",
  "Apex",
  "Velvet",
  "Iron",
  "Crystal",
  "Ember",
  "Frost",
] as const;

const CODENAMES = [
  "Atlas",
  "Nova",
  "Orion",
  "Crest",
  "Summit",
  "Vertex",
  "Harbor",
  "Pulse",
  "Forge",
  "Echo",
  "Drift",
  "Signal",
] as const;

export const DEFAULT_PUBLIC_COUNTRY = "United States";
export const DEFAULT_PUBLIC_TIMEZONE = "MT (UTC-6)";

export const CONTACT_DOSSIER_LOCK_MESSAGE =
  "Full contact dossier unlocks upon approved introduction";

function hashStringToIndex(input: string, modulo: number): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash) % modulo;
}

export function detectCandidateDiscipline(
  roleText: string,
  skills: string[] = []
): CandidateDiscipline {
  const haystack = `${roleText} ${skills.join(" ")}`.toLowerCase();

  if (
    /(\bdesign\b|\bux\b|\bui\b|\bfigma\b|\bvisual\b|\bcreative\b)/.test(
      haystack
    )
  ) {
    return "design";
  }

  if (/(\bproduct\b|\bpm\b|\bprogram manager\b)/.test(haystack)) {
    return "product";
  }

  if (
    /(\bdata\b|\banalyst\b|\banalytics\b|\bml\b|\bmachine learning\b|\bscience\b|\bbi\b)/.test(
      haystack
    )
  ) {
    return "data";
  }

  if (
    /(\bengineer\b|\bdeveloper\b|\bsoftware\b|\bfull[- ]stack\b|\bfrontend\b|\bbackend\b|\bdevops\b|\bplatform\b|\binfrastructure\b|\bmobile\b|\bsystems\b)/.test(
      haystack
    )
  ) {
    return "engineering";
  }

  return "general";
}

export function generateCodenameAlias(input: CodenameAliasInput): string {
  const profileId = input.profileId.trim();
  const roleText = [
    input.headline,
    input.jobTitle,
    input.role,
    input.major,
  ]
    .filter(Boolean)
    .join(" ");

  const discipline = detectCandidateDiscipline(roleText, input.skills ?? []);
  const prefix = DISCIPLINE_PREFIX[discipline];
  const seed = profileId.toLowerCase();
  const adjective =
    ADJECTIVES[hashStringToIndex(`${seed}:adj`, ADJECTIVES.length)];
  const codename =
    CODENAMES[hashStringToIndex(`${seed}:name`, CODENAMES.length)];

  return `${prefix} ${adjective} ${codename}`;
}

export function getCodenameInitials(alias: string): string {
  const parts = alias.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 3) {
    const adjective = parts[parts.length - 2] ?? "";
    const codename = parts[parts.length - 1] ?? "";
    return `${adjective.charAt(0)}${codename.charAt(0)}`.toUpperCase() || "??";
  }

  if (parts.length === 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase() || "??";
  }

  return parts[0]?.slice(0, 2).toUpperCase() || "??";
}

export function formatPublicLocation(
  country?: string | null,
  timezone?: string | null
): string {
  const resolvedCountry = country?.trim() || DEFAULT_PUBLIC_COUNTRY;
  const resolvedTimezone = timezone?.trim() || DEFAULT_PUBLIC_TIMEZONE;
  return `${resolvedCountry} • ${resolvedTimezone}`;
}

export function buildCodenameAliasInputFromProfile(input: {
  id: string;
  job_title?: string | null;
  headline?: string | null;
  major?: string | null;
  role?: string | null;
  skills?: string[] | null;
}): CodenameAliasInput {
  return {
    profileId: input.id,
    jobTitle: input.job_title,
    headline: input.headline,
    major: input.major,
    role: input.role,
    skills: input.skills,
  };
}
