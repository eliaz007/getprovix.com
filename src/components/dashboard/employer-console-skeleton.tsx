const pulse = "animate-pulse bg-zinc-800/50 rounded-lg";

function Pulse({ className }: { className: string }) {
  return <div className={`${pulse} ${className}`} aria-hidden="true" />;
}

function StatCard() {
  return (
    <div className="card-edge rounded-2xl border border-border bg-panel p-5">
      <Pulse className="mb-3 h-3 w-24" />
      <Pulse className="h-8 w-16" />
    </div>
  );
}

function CandidateCard() {
  return (
    <div className="card-edge flex min-h-[260px] flex-col rounded-2xl border border-border bg-panel p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <Pulse className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Pulse className="h-5 w-20 rounded-full" />
          <Pulse className="h-3 w-12" />
        </div>
      </div>
      <Pulse className="mb-2 h-4 w-28" />
      <Pulse className="mb-4 h-3 w-20" />
      <div className="mt-auto flex gap-1.5">
        <Pulse className="h-6 w-14" />
        <Pulse className="h-6 w-16" />
        <Pulse className="h-6 w-12" />
      </div>
    </div>
  );
}

export function EmployerConsoleSkeleton() {
  return (
    <div
      className="w-full max-w-5xl mx-auto space-y-8"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading employer console</span>

      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Pulse className="mb-3 h-3 w-28" />
          <Pulse className="h-8 w-64 max-w-full" />
          <Pulse className="mt-3 h-4 w-80 max-w-full" />
        </div>
        <Pulse className="hidden h-10 w-32 shrink-0 sm:block" />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard />
        <StatCard />
        <StatCard />
        <StatCard />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <aside className="card-edge space-y-5 rounded-2xl border border-border bg-panel p-5 lg:col-span-3">
          <Pulse className="h-3 w-16" />
          <Pulse className="h-8 w-full" />
          <Pulse className="h-3 w-20" />
          <Pulse className="h-10 w-full" />
          <Pulse className="h-3 w-16" />
          <Pulse className="h-10 w-full" />
          <Pulse className="h-3 w-24" />
          <Pulse className="h-10 w-full" />
          <Pulse className="h-10 w-full" />
        </aside>

        <div className="space-y-4 lg:col-span-9">
          <Pulse className="h-11 w-full" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <CandidateCard />
            <CandidateCard />
            <CandidateCard />
          </div>
        </div>
      </div>
    </div>
  );
}
