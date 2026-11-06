"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import type { RunnerCheck, RunnerStatus } from "@/lib/firewall-runner";

function stateClass(state: "OK" | "FAILED" | RunnerStatus): string {
  return state === "OK" || state === "PASSED" ? "text-[#10b981]" : "text-[#ef4444]";
}

export default function RunnerReadout({
  target,
  checks,
  status,
  revealed = checks.length,
  showStatus = true,
}: {
  target: string;
  checks: readonly RunnerCheck[];
  status: RunnerStatus;
  revealed?: number;
  showStatus?: boolean;
}): ReactNode {
  const reduce = useReducedMotion();
  const visible = checks.slice(0, revealed);

  return (
    <div className="overflow-hidden rounded-none border border-white/10 bg-[#141414] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-5">
        <p className="font-mono text-[11px] tracking-wide text-[#a1a1aa]">
          <span className="text-[#ededed]">provix</span>
          <span className="text-[#a1a1aa]">@</span>
          runner
        </p>
        <p className="truncate font-mono text-[11px] text-[#a1a1aa]">{target}</p>
      </div>
      <div className="px-4 py-4 sm:px-5" role="log" aria-live="polite" aria-relevant="additions text">
        <p className="font-mono text-[12px] text-[#a1a1aa]">
          <span className="text-[#ededed]">$</span> provix run --engine ast
        </p>
        <ul className="mt-3 space-y-1.5">
          <AnimatePresence initial={false}>
            {visible.map((check) => (
              <motion.li
                key={check.id}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="grid grid-cols-[minmax(0,9.5rem)_4.5rem_minmax(0,1fr)] items-baseline gap-x-3 font-mono text-[12.5px] sm:grid-cols-[11rem_5rem_minmax(0,1fr)] sm:text-[13px]"
              >
                <span className="text-[#ededed]">{check.label}</span>
                <span className={stateClass(check.state)}>{check.state}</span>
                <span className="truncate text-[#a1a1aa]">{check.detail}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        {showStatus ? (
          <motion.p
            key={`status-${status}`}
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 grid grid-cols-[minmax(0,9.5rem)_4.5rem_minmax(0,1fr)] gap-x-3 border-t border-white/10 pt-3 font-mono text-[12.5px] sm:grid-cols-[11rem_5rem_minmax(0,1fr)] sm:text-[13px]"
          >
            <span className="text-[#ededed]">STATUS</span>
            <span className={stateClass(status)}>{status}</span>
            <span className="text-[#a1a1aa]">{status === "PASSED" ? "clear to merge" : "blocked"}</span>
          </motion.p>
        ) : (
          <p className="mt-3 font-mono text-[12px] text-[#10b981]" aria-hidden="true">
            <span className="animate-pulse motion-reduce:animate-none">▌</span>
          </p>
        )}
      </div>
    </div>
  );
}
