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
  "Lynx",
  "Ion",
  "Aether",
] as const;

export const DEFAULT_PUBLIC_COUNTRY = "United States";
export const DEFAULT_PUBLIC_TIMEZONE = "MT (UTC-6)";

export const CONTACT_DOSSIER_LOCK_MESSAGE =
  "Full contact dossier unlocks upon approved introduction";

export const GITHUB_REPOS_LOCK_MESSAGE =
  "🔒 GitHub & Repos Unlocked on Intro Request";

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

/** Stable two-word alias from a profile UUID, e.g. "Solar Summit" or "Apex Atlas". */
export function generateMaskedAliasFromUuid(uuid: string): string {
  const seed = uuid.trim().toLowerCase() || "candidate";
  const adjective =
    ADJECTIVES[hashStringToIndex(`${seed}:adj`, ADJECTIVES.length)];
  const letter = adjective.charAt(0).toUpperCase();
  const matchingNouns = CODENAMES.filter(
    (noun) => noun.charAt(0).toUpperCase() === letter
  );
  const nounPool = matchingNouns.length > 0 ? matchingNouns : CODENAMES;
  const noun = nounPool[hashStringToIndex(`${seed}:noun`, nounPool.length)];
  return `${adjective} ${noun}`;
}

export function generateCodenameAlias(input: CodenameAliasInput): string {
  return generateMaskedAliasFromUuid(input.profileId);
}

export type AlliterativeAliasIdentity = {
  alias: string;
  firstName: string;
  lastName: string;
  initials: string;
};

/** Force any profile id onto a two-word alliterative alias. Ignores DB names. */
export function buildAlliterativeAliasIdentity(
  profileId: string
): AlliterativeAliasIdentity {
  const alias = generateMaskedAliasFromUuid(profileId);
  const parts = alias.trim().split(/\s+/).filter(Boolean);
  return {
    alias,
    firstName: parts[0] ?? "Candidate",
    lastName: parts.slice(1).join(" "),
    initials: getCodenameInitials(alias),
  };
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

/** Always derive from the profile UUID so stored or real names never leak. */
export function resolveCodenameAlias(profile: {
  id: string;
  codename_alias?: string | null;
  job_title?: string | null;
  headline?: string | null;
  major?: string | null;
  role?: string | null;
  skills?: string[] | null;
}): string {
  return generateMaskedAliasFromUuid(profile.id?.trim() || "");
}
