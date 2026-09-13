import PublicOpportunitiesFeed from "@/components/opportunities/public-opportunities-feed";
import { buildPageMetadata } from "@/lib/site";

export const metadata = buildPageMetadata(
  "Provix Talent Network",
  "Browse curated job listings, companies, and requirements. Sign in to express interest.",
  "/opportunities"
);

export default function PublicOpportunitiesPage() {
  return <PublicOpportunitiesFeed />;
}
