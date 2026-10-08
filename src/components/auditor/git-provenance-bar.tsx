import type { GitProvenance } from "@/lib/forensic-dossier";

function shortSha(sha: string | null): string {
  if (!sha) {
    return "unpinned";
  }
  return sha.slice(0, 12);
}

export default function GitProvenanceBar({
  provenance,
}: {
  provenance: GitProvenance;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800/80 bg-black/50 px-3 py-2.5 font-mono text-[11px] text-zinc-300"
      aria-label="Git provenance"
    >
      <span className="rounded border border-zinc-700/80 bg-zinc-900/80 px-2 py-0.5 text-zinc-200">
        Inspected Files{" "}
        <span className="tabular-nums text-zinc-50">
          {provenance.inspectedFiles.toLocaleString()}
        </span>
      </span>
      <span className="rounded border border-zinc-700/80 bg-zinc-900/80 px-2 py-0.5 text-zinc-200">
        Authored LOC{" "}
        <span className="tabular-nums text-zinc-50">
          ~{provenance.authoredLocEstimate.toLocaleString()}
        </span>
        <span className="ml-1 text-zinc-500">est.</span>
      </span>
      <span className="rounded border border-zinc-700/80 bg-zinc-900/80 px-2 py-0.5 text-zinc-200">
        Branch{" "}
        <span className="text-emerald-300">{provenance.branch}</span>
      </span>
      <span
        className="rounded border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-violet-200"
        title={provenance.commitSha ?? "Commit not pinned"}
      >
        SHA {shortSha(provenance.commitSha)}
      </span>
      <span className="rounded border border-zinc-700/80 bg-zinc-900/80 px-2 py-0.5 text-zinc-400">
        AST {provenance.astEngine}
      </span>
    </div>
  );
}
