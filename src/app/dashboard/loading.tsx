export default function DashboardLoading() {
  return (
    <div className="p-8 space-y-6 w-full max-w-7xl animate-pulse">
      <div className="h-8 w-48 bg-zinc-800/60 rounded-lg" />
      <div className="h-4 w-96 bg-zinc-800/40 rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        <div className="h-36 bg-zinc-900/50 border border-zinc-800 rounded-xl" />
        <div className="h-36 bg-zinc-900/50 border border-zinc-800 rounded-xl" />
        <div className="h-36 bg-zinc-900/50 border border-zinc-800 rounded-xl" />
      </div>
      <div className="h-64 bg-zinc-900/50 border border-zinc-800 rounded-xl" />
    </div>
  );
}
