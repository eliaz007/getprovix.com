"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

const SCAN_STEPS = [
  "Connecting to repository...",
  "Reading project files...",
  "Scanning for exposed secrets and data leaks...",
  "Checking database security rules...",
  "Putting together your security report...",
] as const;

const EARLY_STEP_MS = 1800;
const CREEP_MS = 2000;
const FINAL_INDEX = SCAN_STEPS.length - 1;

export default function AuditScanningPanel({
  repo,
}: {
  repo: string | null;
}) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(8);
  const creepStarted = useRef(false);

  // Advance through early steps only. The final step stays active until this panel unmounts.
  useEffect(() => {
    setStep(0);
    setProgress(8);
    creepStarted.current = false;

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let index = 0; index < FINAL_INDEX; index += 1) {
      timers.push(
        setTimeout(() => {
          setStep(index + 1);
          // Plateau at 80% when we enter the final step.
          if (index + 1 >= FINAL_INDEX) {
            setProgress(80);
          } else {
            const pct = Math.round(((index + 1) / FINAL_INDEX) * 72);
            setProgress(Math.min(72, Math.max(12, pct)));
          }
        }, (index + 1) * EARLY_STEP_MS)
      );
    }

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [repo]);

  // Once on the final step, creep 80% → 99% (1% every 2s) until the API finishes and unmounts us.
  useEffect(() => {
    if (step < FINAL_INDEX) return;
    if (!creepStarted.current) {
      creepStarted.current = true;
      setProgress((current) => Math.max(current, 80));
    }
    const id = setInterval(() => {
      setProgress((current) => (current >= 99 ? 99 : current + 1));
    }, CREEP_MS);
    return () => clearInterval(id);
  }, [step]);

  return (
    <motion.section
      className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0A0A0B] px-6 py-10 sm:px-10"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.12),transparent_55%)]" />

      <div className="relative mx-auto flex max-w-lg flex-col items-center text-center">
        <div className="relative mb-8 flex h-28 w-28 items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-violet-400/20" />
          <span className="absolute inset-2 animate-[audit-radar_2.4s_ease-out_infinite] rounded-full border border-violet-400/35" />
          <span className="absolute inset-5 animate-[audit-radar_2.4s_ease-out_infinite] rounded-full border border-violet-300/25 [animation-delay:0.4s]" />
          <span className="absolute inset-9 animate-pulse rounded-full bg-violet-500/25 shadow-[0_0_40px_rgba(124,58,237,0.35)]" />
          <span className="relative h-3 w-3 rounded-full bg-violet-200" />
        </div>

        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Scanning</p>
        <h2 className="mt-2 text-xl font-medium tracking-tight text-zinc-50 sm:text-2xl">
          Looking through your project
        </h2>
        <p className="mt-2 font-mono text-sm text-zinc-500">{repo ?? "repository"}</p>

        <div className="mt-8 w-full">
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800/90">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 via-violet-400 to-emerald-400"
              initial={{ width: "8%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          </div>
          <p className="mt-2 text-left text-[11px] uppercase tracking-[0.16em] text-zinc-600">
            {progress}% complete
          </p>
        </div>

        <ul className="mt-8 w-full space-y-2.5 text-left">
          {SCAN_STEPS.map((label, index) => {
            // Final step is never a green check while the request is in flight.
            const done = index < step && index < FINAL_INDEX;
            const active = index === step || (step >= FINAL_INDEX && index === FINAL_INDEX);
            return (
              <motion.li
                key={label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: done || active ? 1 : 0.35, x: 0 }}
                transition={{ delay: index * 0.06, duration: 0.35 }}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm ${
                  done
                    ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-200"
                    : active
                      ? "border-violet-500/35 bg-violet-500/10 text-violet-100"
                      : "border-white/[0.05] bg-white/[0.02] text-zinc-500"
                }`}
              >
                {done ? (
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300"
                    aria-hidden
                  >
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2.5 6.5 4.8 9 9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                ) : active ? (
                  <span
                    className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-violet-300/30 border-t-violet-200"
                    aria-hidden
                  />
                ) : (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
                    <span className="h-2 w-2 rounded-full bg-zinc-700" />
                  </span>
                )}
                <span className="leading-snug">{label}</span>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </motion.section>
  );
}
