"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const SCAN_STEPS = [
  "Connecting to repository...",
  "Reading project files...",
  "Scanning for exposed secrets and data leaks...",
  "Checking database security rules...",
  "Putting together your security report...",
] as const;

export default function AuditScanningPanel({
  repo,
}: {
  repo: string | null;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
    const timers = SCAN_STEPS.map((_, index) =>
      setTimeout(() => {
        setStep(index);
      }, index * 1600)
    );
    // Hold on the final step until the real scan finishes.
    const hold = setTimeout(() => {
      setStep(SCAN_STEPS.length - 1);
    }, (SCAN_STEPS.length - 1) * 1600);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(hold);
    };
  }, [repo]);

  const progress = Math.min(92, Math.round(((step + 1) / SCAN_STEPS.length) * 100));

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
              transition={{ duration: 0.55, ease: "easeOut" }}
            />
          </div>
          <p className="mt-2 text-left text-[11px] uppercase tracking-[0.16em] text-zinc-600">
            {progress}% complete
          </p>
        </div>

        <ul className="mt-8 w-full space-y-2.5 text-left">
          {SCAN_STEPS.map((label, index) => {
            const done = index < step;
            const active = index === step;
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
                <span
                  className={`flex h-2 w-2 shrink-0 rounded-full ${
                    done ? "bg-emerald-400" : active ? "animate-pulse bg-violet-300" : "bg-zinc-700"
                  }`}
                  aria-hidden
                />
                <span className="leading-snug">{label}</span>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </motion.section>
  );
}
