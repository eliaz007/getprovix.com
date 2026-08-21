export const FLAT_FEE_THRESHOLD = 25_000;
export const FLAT_FEE_AMOUNT = 2_500;
export const CONTINGENCY_RATE = 0.1;
export const DEFAULT_CANDIDATE_BONUS = 750;
export const CANDIDATE_BONUS_RANGE_LABEL = "$750";

export type PlacementRevenueInput = {
  agreed_first_year_compensation?: number | null;
  candidate_bonus_allocated?: number | null;
};

export function parseCompensationValue(
  value: number | string | null | undefined
): number | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const parsed = Number.parseFloat(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function calculatePlacementFee(salary: number): number {
  if (salary <= FLAT_FEE_THRESHOLD) {
    return FLAT_FEE_AMOUNT;
  }

  return salary * CONTINGENCY_RATE;
}

export function calculateCandidateBonus(
  salary: number,
  allocated?: number | null
): number {
  if (salary > FLAT_FEE_THRESHOLD) {
    return 0;
  }

  const parsedAllocated = parseCompensationValue(allocated ?? null);
  return parsedAllocated ?? DEFAULT_CANDIDATE_BONUS;
}

export function summarizePlacementRevenue(
  hires: PlacementRevenueInput[]
): {
  platformRevenue: number;
  candidateBonusesAllocated: number;
  hiredCount: number;
} {
  let platformRevenue = 0;
  let candidateBonusesAllocated = 0;
  let hiredCount = 0;

  for (const hire of hires) {
    const salary = parseCompensationValue(hire.agreed_first_year_compensation);
    if (!salary) {
      continue;
    }

    hiredCount += 1;
    platformRevenue += calculatePlacementFee(salary);
    candidateBonusesAllocated += calculateCandidateBonus(
      salary,
      hire.candidate_bonus_allocated
    );
  }

  return {
    platformRevenue,
    candidateBonusesAllocated,
    hiredCount,
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}
