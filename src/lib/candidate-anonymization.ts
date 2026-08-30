import {
  formatPublicLocation,
  generateMaskedAliasFromUuid,
  getCodenameInitials,
} from "@/lib/alias-generator";
import { introUnlockKeysForCandidateId } from "@/lib/intro-request-status";

export {
  CONTACT_DOSSIER_LOCK_MESSAGE,
  buildAlliterativeAliasIdentity,
  formatPublicLocation,
  generateCodenameAlias,
  generateMaskedAliasFromUuid,
  getCodenameInitials,
} from "@/lib/alias-generator";

export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export type PublicCandidateIdentity = {
  codenameAlias?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  candidateId?: string | null;
  country?: string | null;
  timezone?: string | null;
};

export function getPublicCandidateDisplayName(
  candidate: PublicCandidateIdentity
): string {
  const profileId = candidate.candidateId?.trim() || "";
  if (profileId && !/^C-/i.test(profileId)) {
    return generateMaskedAliasFromUuid(profileId);
  }

  return generateMaskedAliasFromUuid(profileId || "candidate");
}

function identityNameTokens(identity: {
  fullName?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileName?: string | null;
}): string[] {
  const raw = [
    identity.fullName,
    identity.name,
    identity.profileName,
    identity.firstName,
    identity.lastName,
  ]
    .flatMap((value) => (value ?? "").trim().split(/\s+/))
    .map((token) => token.replace(/[^\p{L}\p{N}'-]/gu, ""))
    .filter((token) => token.length >= 3);

  return [...new Set(raw)].sort((a, b) => b.length - a.length);
}

export function redactPersonalNamesFromText(
  text: string,
  identity: {
    fullName?: string | null;
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    profileName?: string | null;
  },
  replacement = "Candidate"
): string {
  let result = text;
  for (const token of identityNameTokens(identity)) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\b${escaped}\\b`, "giu"), replacement);
  }
  return result;
}

export function getPublicCandidateInitials(
  candidate: PublicCandidateIdentity
): string {
  return getCodenameInitials(getPublicCandidateDisplayName(candidate));
}

export function getPublicCandidateLocation(
  candidate: Pick<PublicCandidateIdentity, "country" | "timezone">
): string {
  return formatPublicLocation(candidate.country, candidate.timezone);
}

export function normalizeCandidateProfileKey(
  value: string | null | undefined
): string {
  return value?.trim().toLowerCase() ?? "";
}

export function isIntroUnlockedForCandidate(
  candidate: { profileId?: string | null; id?: string | null },
  unlockedProfileIds: Set<string>
): boolean {
  if (unlockedProfileIds.size === 0) {
    return false;
  }

  const candidateKeys = [
    ...introUnlockKeysForCandidateId(candidate.profileId ?? ""),
    ...introUnlockKeysForCandidateId(candidate.id ?? ""),
  ];

  return candidateKeys.some((key) => unlockedProfileIds.has(key));
}

export {
  INTRO_UNLOCK_STATUSES,
  collectUnlockedCandidateIds,
  introUnlockKeysForCandidateId,
  isIntroUnlockStatus,
} from "@/lib/intro-request-status";
