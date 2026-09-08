import {
  CONTINGENCY_RATE,
  REPLACEMENT_GUARANTEE_DAYS,
} from "@/lib/placement-revenue";

export const PUBLIC_PLACEMENT_FEE_PERCENT = Math.round(CONTINGENCY_RATE * 100);

export const PUBLIC_PLACEMENT_FEE_LABEL = `${PUBLIC_PLACEMENT_FEE_PERCENT}% contingency placement fee on successful first-year base salary`;

export const PUBLIC_PLACEMENT_GUARANTEE_LABEL = `full ${REPLACEMENT_GUARANTEE_DAYS}-day replacement guarantee`;

/** Canonical public pricing/terms sentence. */
export const PUBLIC_PLACEMENT_TERMS_SUMMARY = `${PUBLIC_PLACEMENT_FEE_LABEL}, backed by a ${PUBLIC_PLACEMENT_GUARANTEE_LABEL}.`;
