import { Suspense } from "react";
import PitchStudioPanel from "@/components/pitch-studio/pitch-studio-panel";
import { DashboardContentSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { buildPageMetadata } from "@/lib/site";

export const metadata = buildPageMetadata(
  "Pitch Studio",
  "Generate high-signal founder outreach — DM, email, and video intro scripts tailored to your proof-of-work.",
  "/dashboard/pitch-studio"
);

export default function PitchStudioPage() {
  return (
    <Suspense fallback={<DashboardContentSkeleton />}>
      <PitchStudioPanel />
    </Suspense>
  );
}
