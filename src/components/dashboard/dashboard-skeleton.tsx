function Pulse({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse motion-reduce:animate-none ${className}`}
      aria-hidden="true"
    />
  );
}

function MetricCard() {
  return (
    <div className="card-edge bg-panel p-5 rounded-2xl border border-border">
      <Pulse className="h-3 w-24 rounded mb-3 bg-white/5" />
      <Pulse className="h-8 w-16 rounded bg-white/5" />
      <Pulse className="h-3 w-20 rounded mt-2 bg-white/5" />
    </div>
  );
}

function ContentCard() {
  return (
    <div className="card-edge bg-panel border border-border rounded-2xl p-5 min-h-[180px]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <Pulse className="w-11 h-11 rounded-lg shrink-0 bg-white/5" />
          <div className="space-y-2 pt-0.5">
            <Pulse className="h-4 w-36 rounded bg-white/5" />
            <Pulse className="h-3 w-24 rounded bg-white/5" />
          </div>
        </div>
        <Pulse className="h-5 w-16 rounded-full bg-white/5" />
      </div>
      <Pulse className="h-3 w-28 rounded mb-4 bg-white/5" />
      <div className="flex gap-1.5">
        <Pulse className="h-6 w-14 rounded-md bg-white/5" />
        <Pulse className="h-6 w-16 rounded-md bg-white/5" />
        <Pulse className="h-6 w-12 rounded-md bg-white/5" />
      </div>
    </div>
  );
}

export function DashboardContentSkeleton() {
  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <div>
        <Pulse className="h-3 w-28 rounded mb-3 bg-panel" />
        <Pulse className="h-9 w-64 max-w-full rounded bg-panel" />
        <Pulse className="h-4 w-80 max-w-full rounded mt-3 bg-panel" />
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
          <Pulse className="h-10 w-full rounded-xl bg-white/5" />
          <Pulse className="h-10 w-full lg:w-28 rounded-xl shrink-0 bg-white/5" />
          <Pulse className="h-10 w-full lg:w-40 rounded-xl shrink-0 bg-white/5" />
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

export default function DashboardSkeleton() {
  return (
    <div
      className="flex min-h-screen bg-[#0B0B0D] text-textMain"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading dashboard</span>

      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/[0.08] bg-[#0E0E12] p-5 md:flex">
        <div className="flex items-center gap-3">
          <Pulse className="h-8 w-8 rounded-[22%] bg-white/10" />
          <Pulse className="h-3 w-20 rounded bg-white/10" />
        </div>
        <Pulse className="mt-2 h-5 w-28 rounded-md bg-white/5" />
        <div className="mt-6 space-y-2">
          <Pulse className="h-3 w-16 rounded bg-white/5" />
          <Pulse className="h-8 w-full rounded-lg bg-white/5" />
          <Pulse className="h-8 w-full rounded-lg bg-white/5" />
          <Pulse className="h-8 w-full rounded-lg bg-white/5" />
          <Pulse className="mt-4 h-3 w-16 rounded bg-white/5" />
          <Pulse className="h-8 w-full rounded-lg bg-white/5" />
          <Pulse className="h-8 w-full rounded-lg bg-white/5" />
        </div>
        <div className="mt-auto border-t border-white/[0.06] pt-4">
          <Pulse className="h-8 w-full rounded-md bg-white/5" />
        </div>
      </aside>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="mx-auto w-full max-w-6xl p-8">
          <DashboardContentSkeleton />
        </div>
      </div>
    </div>
  );
}
