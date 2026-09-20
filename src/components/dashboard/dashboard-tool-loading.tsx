import DashboardSkeleton from "@/components/dashboard/dashboard-skeleton";

/** Lightweight in-shell pulse — avoids a second full-screen overlay on top of dashboard/loading. */
export default function DashboardToolLoading() {
  return (
    <div className="min-h-[50vh] w-full rounded-2xl border border-border bg-panel/40 p-4">
      <DashboardSkeleton />
    </div>
  );
}
