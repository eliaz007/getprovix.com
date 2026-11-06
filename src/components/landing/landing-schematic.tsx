import type { ReactNode } from "react";

export default function LandingSchematic(): ReactNode {
  return (
    <div className="flex h-full flex-col bg-[#18181B]">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#141414] px-4 py-3">
        <p className="truncate font-mono text-xs text-[#a1a1aa]">PR #142 // app/api/checkout/route.ts</p>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-[#c4b5fd] uppercase">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7c3aed] motion-reduce:animate-none" />
          Live
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-0 p-4 sm:p-5">
        <pre className="border border-[#ef4444]/30 bg-[#ef4444]/8 px-3 py-3 font-mono text-[12px] leading-6 text-[#ef4444]">
          - const userId = req.query.id; // Unvalidated input
        </pre>

        <div className="flex items-center gap-3 py-3">
          <span className="h-px flex-1 bg-[#D8DCE3]" />
          <span className="font-mono text-[10px] tracking-widest text-[#c4b5fd]">[AST AUTO-HEAL]</span>
          <span className="h-px flex-1 bg-[#D8DCE3]" />
        </div>

        <pre className="border border-[#10b981]/30 bg-[#10b981]/8 px-3 py-3 font-mono text-[12px] leading-6 text-[#10b981]">
          + const {"{ userId }"} = CheckoutSchema.parse(req.query);
        </pre>

        <p className="mt-4 font-mono text-[10px] tracking-wide text-[#c4b5fd]">
          TYPE // CheckoutSchema.userId: string
        </p>
      </div>

      <footer className="border-t border-white/10 bg-[#141414] px-4 py-3">
        <p className="font-mono text-[10px] tracking-widest text-[#a1a1aa] uppercase">
          Scan time: 42ms | Zero false positives
        </p>
      </footer>
    </div>
  );
}
