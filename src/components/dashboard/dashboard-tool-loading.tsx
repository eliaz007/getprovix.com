/** Inner-content pulse only — layout.tsx already keeps the real sidebar. */
export default function DashboardToolLoading() {
  return (
    <div className="w-full max-w-7xl animate-pulse space-y-6">
      <div className="h-8 w-48 rounded-lg bg-zinc-800/60" />
      <div className="h-4 w-96 max-w-full rounded-lg bg-zinc-800/40" />
      <div className="grid grid-cols-1 gap-6 pt-4 md:grid-cols-3">
        <div className="h-36 rounded-xl border border-zinc-800 bg-zinc-900/50" />
        <div className="h-36 rounded-xl border border-zinc-800 bg-zinc-900/50" />
        <div className="h-36 rounded-xl border border-zinc-800 bg-zinc-900/50" />
      </div>
      <div className="h-64 rounded-xl border border-zinc-800 bg-zinc-900/50" />
    </div>
  );
}
