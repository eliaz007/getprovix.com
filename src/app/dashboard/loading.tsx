import DashboardSkeleton from "@/components/dashboard/dashboard-skeleton";

/**
 * Soft loading state for the dashboard children slot.
 * Avoid `fixed inset-0` — that overlay covered the sidebar during nested
 * AI-tool transitions and read as a navigation deadlock when ContentGate
 * had not yet flipped `contentReady` back to true.
 */
export default function DashboardLoading() {
  return (
    <div className="min-h-screen w-full bg-background p-4 md:p-6">
      <DashboardSkeleton />
    </div>
  );
}
