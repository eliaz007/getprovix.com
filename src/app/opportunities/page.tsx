import type { Metadata } from "next";
import PublicOpportunitiesFeed from "@/components/opportunities/public-opportunities-feed";

export const metadata: Metadata = {
  title: "Opportunities — Provix",
  description:
    "Browse curated job listings, companies, and requirements. Sign in to express interest.",
};

export default function PublicOpportunitiesPage() {
  return <PublicOpportunitiesFeed />;
}
