import {
  formatPublicLocation,
  generateCodenameAlias,
  getCodenameInitials,
} from "@/lib/alias-generator";

export {
  CONTACT_DOSSIER_LOCK_MESSAGE,
  formatPublicLocation,
  generateCodenameAlias,
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
  const alias = candidate.codenameAlias?.trim();
  if (alias) {
    return alias;
  }

  return generateCodenameAlias({
    profileId:
      candidate.candidateId?.replace(/^C-/i, "") ||
      candidate.fullName ||
      "candidate",
    headline: candidate.fullName,
  });
}

export function getPublicCandidateInitials(
  candidate: PublicCandidateIdentity
): string {
  const alias = candidate.codenameAlias?.trim();
  if (alias) {
    return getCodenameInitials(alias);
  }

  const generated = getPublicCandidateDisplayName(candidate);
  return getCodenameInitials(generated);
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
  const profileId = normalizeCandidateProfileKey(candidate.profileId);
  if (profileId && unlockedProfileIds.has(profileId)) {
    return true;
  }

  const displayId = normalizeCandidateProfileKey(candidate.id);
  return Boolean(displayId && unlockedProfileIds.has(displayId));
}

export {
  INTRO_UNLOCK_STATUSES,
  isIntroUnlockStatus,
} from "@/lib/intro-request-status";
