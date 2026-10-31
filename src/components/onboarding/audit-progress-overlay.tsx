"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Shield } from "lucide-react";

const PILLARS = [
  "Auth boundaries",
  "RLS surface",
  "Client query exposure",
  "Dependency risk",
  "AST integrity",
] as const;

export default function AuditProgressOverlay({
  open,
  repo,
}: {
  open: boolean;
  repo: string | null;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) {
      setStep(0);
      return;
    }
    setStep(0);
    const timers = PILLARS.map((_, index) =>
      setTimeout(() => setStep(index + 1), 700 + index * 780)
    );
    return () => timers.forEach(clearTimeout);
  }, [open]);

  const progress = Math.min(100, Math.round((step / PILLARS.length) * 100));

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 px-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          <motion.div
            className="w-full max-w-md"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10">
                <Shield className="h-5 w-5 text-violet-300" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight text-zinc-100">
                  Initial AST audit
                </p>
                <p className="font-mono text-xs text-zinc-500">
                  {repo ?? "repository"}
                </p>
              </div>
            </div>

            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400"
                initial={{ width: "0%" }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              />
            </div>
            <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              {progress}% · walking audit pillars
            </p>

            <ul className="space-y-2.5">
              {PILLARS.map((pillar, index) => {
                const done = step > index;
                const active = step === index;
                return (
                  <li
                    key={pillar}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                      done
                        ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-200"
                        : active
                          ? "border-violet-500/35 bg-violet-500/10 text-violet-100"
                          : "border-white/5 bg-white/[0.02] text-zinc-500"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] ${
                        done
                          ? "border-emerald-400/40 bg-emerald-500/15"
                          : active
                            ? "border-violet-400/40 bg-violet-500/15"
                            : "border-zinc-700"
                      }`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
                    </span>
                    <span className="text-sm font-medium tracking-tight">{pillar}</span>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
