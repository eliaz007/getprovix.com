import { Suspense } from "react";
import PublicOpportunitiesFeed from "@/components/opportunities/public-opportunities-feed";
import { DashboardContentSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { buildPageMetadata } from "@/lib/site";

export const metadata = buildPageMetadata(
  "Provix Talent Network",
  "Browse curated job listings, companies, and requirements. Sign in to express interest.",
  "/opportunities"
);

export default function PublicOpportunitiesPage() {
  return (
    <Suspense fallback={<DashboardContentSkeleton />}>
      <PublicOpportunitiesFeed />
    </Suspense>
  );
}
