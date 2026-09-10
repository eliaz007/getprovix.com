function Pulse({ className }: { className: string }) {
  return (
    <div
      className={`bg-panel animate-pulse motion-reduce:animate-none ${className}`}
      aria-hidden="true"
    />
  );
}

function MetricCard() {
  return (
    <div className="card-edge bg-panel p-5 rounded-2xl border border-border">
      <Pulse className="h-3 w-24 rounded mb-3" />
      <Pulse className="h-8 w-16 rounded" />
      <Pulse className="h-3 w-20 rounded mt-2" />
    </div>
  );
}

function ContentCard() {
  return (
    <div className="card-edge bg-panel border border-border rounded-2xl p-5 min-h-[180px]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <Pulse className="w-11 h-11 rounded-lg shrink-0" />
          <div className="space-y-2 pt-0.5">
            <Pulse className="h-4 w-36 rounded" />
            <Pulse className="h-3 w-24 rounded" />
          </div>
        </div>
        <Pulse className="h-5 w-16 rounded-full" />
      </div>
      <Pulse className="h-3 w-28 rounded mb-4" />
      <div className="flex gap-1.5">
        <Pulse className="h-6 w-14 rounded-md" />
        <Pulse className="h-6 w-16 rounded-md" />
        <Pulse className="h-6 w-12 rounded-md" />
      </div>
    </div>
  );
}

export default function DashboardSkeleton() {
  return (
    <div
      className="w-full max-w-5xl mx-auto space-y-10 animate-fadeIn"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading dashboard</span>

      <div>
        <Pulse className="h-3 w-28 rounded mb-3" />
        <Pulse className="h-9 w-64 max-w-full rounded" />
        <Pulse className="h-4 w-80 max-w-full rounded mt-3" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard />
        <MetricCard />
        <div className="col-span-2 lg:col-span-1">
          <MetricCard />
        </div>
      </div>

      <div className="card-edge bg-panel border border-border rounded-2xl p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <Pulse className="h-10 w-full rounded-xl" />
          <Pulse className="h-10 w-full lg:w-28 rounded-xl shrink-0" />
          <Pulse className="h-10 w-full lg:w-40 rounded-xl shrink-0" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ContentCard />
        <ContentCard />
        <ContentCard />
        <ContentCard />
      </div>
    </div>
  );
}
