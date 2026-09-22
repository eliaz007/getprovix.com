function Pulse({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse motion-reduce:animate-none ${className}`}
      aria-hidden="true"
    />
  );
}

function NavItemPulse({ wide = false }: { wide?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Pulse className="h-4 w-4 shrink-0 rounded bg-white/10" />
      <Pulse className={`h-3 rounded bg-white/10 ${wide ? "w-28" : "w-20"}`} />
    </div>
  );
}

function MetricCard() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#131316]/90 p-5 shadow-xl backdrop-blur-md">
      <Pulse className="mb-3 h-3 w-24 rounded bg-white/5" />
      <Pulse className="h-8 w-16 rounded bg-white/5" />
      <Pulse className="mt-2 h-3 w-20 rounded bg-white/5" />
    </div>
  );
}

function ContentCard() {
  return (
    <div className="min-h-[180px] rounded-xl border border-white/[0.08] bg-[#131316]/90 p-5 shadow-2xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Pulse className="h-11 w-11 shrink-0 rounded-lg bg-white/5" />
          <div className="space-y-2 pt-0.5">
            <Pulse className="h-4 w-36 rounded bg-white/5" />
            <Pulse className="h-3 w-24 rounded bg-white/5" />
          </div>
        </div>
        <Pulse className="h-5 w-16 rounded-md bg-white/10" />
      </div>
      <Pulse className="mb-4 h-3 w-28 rounded bg-white/5" />
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
        <Pulse className="mb-3 h-3 w-28 rounded bg-white/10" />
        <Pulse className="h-8 w-64 max-w-full rounded bg-white/10" />
        <Pulse className="mt-3 h-4 w-80 max-w-full rounded bg-white/5" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard />
        <MetricCard />
        <div className="col-span-2 lg:col-span-1">
          <MetricCard />
        </div>
      </div>

      <div className="card-edge rounded-xl border border-white/[0.08] bg-[#131316]/90 p-4">
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
      className="flex h-screen overflow-hidden bg-[#0B0B0D] text-zinc-100"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading dashboard</span>

      <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-white/[0.08] bg-[#0E0E12] md:flex">
        <div className="flex min-h-screen flex-col justify-between p-4">
          <div>
            <div className="mb-6 flex items-center gap-2.5 px-3 py-1.5">
              <Pulse className="h-6 w-6 shrink-0 rounded-md bg-white/10" />
              <Pulse className="h-3 w-16 rounded bg-white/10" />
            </div>
            <Pulse className="mx-3 mb-1 h-2.5 w-20 rounded bg-white/10" />
            <div className="space-y-0.5">
              <NavItemPulse />
              <NavItemPulse wide />
              <NavItemPulse />
            </div>
            <div className="mt-5">
              <Pulse className="mx-3 mb-1 h-2.5 w-28 rounded bg-white/10" />
              <div className="space-y-0.5">
                <NavItemPulse />
                <NavItemPulse wide />
              </div>
            </div>
          </div>
          <div className="border-t border-white/[0.08] pt-3">
            <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-[#131316]/90 px-2.5 py-2">
              <Pulse className="h-8 w-8 shrink-0 rounded-md bg-white/10" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Pulse className="h-3 w-20 rounded bg-white/10" />
                <Pulse className="h-3 w-24 rounded bg-white/10" />
              </div>
              <Pulse className="h-7 w-7 shrink-0 rounded-md bg-white/10" />
            </div>
          </div>
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto min-h-screen w-full max-w-6xl p-8">
          <DashboardContentSkeleton />
        </div>
      </div>
    </div>
  );
}
