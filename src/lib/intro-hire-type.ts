export type IntroHireType = "fulltime" | "contract";

export const CONTRACT_INTRO_COMMITMENT_OPTIONS = [
  "10-20 hrs/week",
  "20-40 hrs/week",
  "Flexible / Milestone-based",
] as const;

export type ContractIntroCommitment =
  (typeof CONTRACT_INTRO_COMMITMENT_OPTIONS)[number];

export const CONTRACT_INTRO_DURATION_OPTIONS = [
  "< 1 month",
  "1-3 months",
  "3-6 months",
  "Ongoing",
] as const;

export type ContractIntroDuration =
  (typeof CONTRACT_INTRO_DURATION_OPTIONS)[number];

/**
 * Encode contract intro details into the existing compensation_range /
 * compensation_band text columns so full-time rows stay unchanged.
 */
export function formatContractIntroCompensationRange(input: {
  hourlyRate: number;
  commitment: string;
  duration: string;
}): string {
  const rate = Math.round(input.hourlyRate);
  return `Contract $${rate}/hr · ${input.commitment.trim()} · ${input.duration.trim()}`;
}

export function isContractIntroCompensationRange(value: string | null | undefined): boolean {
  return /^Contract\s+\$\d+\/hr/i.test((value ?? "").trim());
}
