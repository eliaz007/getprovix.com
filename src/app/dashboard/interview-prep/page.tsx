import { Suspense } from "react";
import InterviewPrepPanel from "@/components/interview-prep/interview-prep-panel";
import { DashboardContentSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { buildPageMetadata } from "@/lib/site";

export const metadata = buildPageMetadata(
  "Interview Simulator",
  "Practice technical and behavioral rounds with Provix AI interview prep.",
  "/dashboard/interview-prep"
);

export default function InterviewPrepPage() {
  return (
    <Suspense fallback={<DashboardContentSkeleton />}>
      <InterviewPrepPanel />
    </Suspense>
  );
}
