import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/site";

export const metadata = buildPageMetadata(
  "Pricing",
  "Provix pricing for automated Next.js and Supabase security and architecture audits, GitHub scanning, and verified fix pull requests.",
  "/pricing"
);

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
