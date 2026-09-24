import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/site";
import { PUBLIC_PLACEMENT_TERMS_SUMMARY } from "@/lib/placement-terms";

export const metadata = buildPageMetadata(
  "Pricing",
  `Hire vetted engineering talent with zero upfront cost. ${PUBLIC_PLACEMENT_TERMS_SUMMARY}`,
  "/pricing"
);

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
