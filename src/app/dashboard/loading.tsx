import DashboardSkeleton from "@/components/dashboard/dashboard-skeleton";

export default function DashboardLoading() {
  return (
    <div className="fixed inset-0 z-[60] bg-background">
      <DashboardSkeleton />
    </div>
  );
}
