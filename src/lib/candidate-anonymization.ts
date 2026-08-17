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

export type AnonymizedNameInput = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  candidateId?: string | null;
};

export function formatAnonymizedName(input: AnonymizedNameInput): string {
  const firstName = input.firstName?.trim();
  const lastName = input.lastName?.trim();

  if (firstName && lastName) {
    return `${firstName} ${lastName.charAt(0).toUpperCase()}.`;
  }

  if (firstName) {
    return firstName;
  }

  const parsed = splitFullName(input.fullName?.trim() || "");
  if (parsed.firstName && parsed.lastName) {
    return `${parsed.firstName} ${parsed.lastName.charAt(0).toUpperCase()}.`;
  }

  if (parsed.firstName) {
    return parsed.firstName;
  }

  const candidateId = input.candidateId?.trim();
  if (candidateId) {
    const numeric = candidateId.replace(/\D/g, "");
    return numeric ? `Candidate #${numeric}` : candidateId;
  }

  return "Candidate";
}

export function getAnonymizedInitials(input: AnonymizedNameInput): string {
  const displayName = formatAnonymizedName(input);

  return (
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.replace(/[^A-Za-z0-9]/g, "").charAt(0)?.toUpperCase())
      .filter(Boolean)
      .join("") || "??"
  );
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

export const INTRO_UNLOCK_STATUSES = new Set(["approved", "completed"]);

export function isIntroUnlockStatus(status: string | null | undefined): boolean {
  return INTRO_UNLOCK_STATUSES.has((status ?? "").trim().toLowerCase());
}
