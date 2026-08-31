import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/site";

export const metadata = buildPageMetadata(
  "Pricing",
  "Hire vetted engineering talent with zero upfront cost. Browse proof-of-work profiles and run AI screenings free during beta.",
  "/pricing"
);

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
