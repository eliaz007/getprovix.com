"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";

type LineState = "OK" | "FAILED";

type ScriptLine = {
  label: string;
  state: LineState;
  detail: string;
};

type LogLine = ScriptLine & {
  id: string;
  clock: string;
};

const FAILED_RUN: readonly ScriptLine[] = [
  { label: "AST_PARSE", state: "OK", detail: "SourceFile app/checkout/page.tsx" },
  { label: "BOUNDARY_CHECK", state: "FAILED", detail: "secret bound on the client tree" },
  { label: "DEPENDENCY_FLOOR", state: "OK", detail: "package.json held" },
  { label: "PR_PATCH", state: "OK", detail: "process.env.STRIPE_SECRET_KEY" },
  { label: "STATUS", state: "FAILED", detail: "blocked" },
];

const PASSED_RUN: readonly ScriptLine[] = [
  { label: "AST_PARSE", state: "OK", detail: "SourceFile app/checkout/page.tsx" },
  { label: "BOUNDARY_CHECK", state: "OK", detail: 'await getSecret("STRIPE_SECRET_KEY")' },
  { label: "DEPENDENCY_FLOOR", state: "OK", detail: "package.json held" },
  { label: "PR_PATCH", state: "OK", detail: "createClient import added" },
  { label: "STATUS", state: "OK", detail: "clear to merge" },
];

const RUNS = [FAILED_RUN, PASSED_RUN] as const;
const TICK_MS = 700;
const HOLD_MS = 1600;

function clockFor(index: number): string {
  const base = 12 * 3600 + index;
  const hours = String(Math.floor(base / 3600) % 24).padStart(2, "0");
  const minutes = String(Math.floor(base / 60) % 60).padStart(2, "0");
  const seconds = String(base % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function TypedDetail({ text, active }: { text: string; active: boolean }): ReactNode {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce || !active ? text.length : 0);

  useEffect(() => {
    if (reduce || !active) {
      setShown(text.length);
      return;
    }
    setShown(0);
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= text.length) window.clearInterval(timer);
    }, 14);
    return () => window.clearInterval(timer);
  }, [text, active, reduce]);

  return (
    <span className="truncate text-[#f9fafb]/45">
      {text.slice(0, shown)}
      {active && shown < text.length ? (
        <span className="text-purple-400" aria-hidden>
          ▌
        </span>
      ) : null}
    </span>
  );
}

export default function CliLogStream(): ReactNode {
  const [runIndex, setRunIndex] = useState(0);
  const [count, setCount] = useState(0);
  const reduce = useReducedMotion();
  const script = RUNS[runIndex] ?? FAILED_RUN;
  const streaming = count < script.length;
  const lines: LogLine[] = script.slice(0, count).map((line, index) => ({
    ...line,
    id: `${runIndex}-${line.label}`,
    clock: clockFor(index),
  }));

  useEffect(() => {
    if (reduce) {
      setCount(script.length);
      return;
    }
    const delay = streaming ? TICK_MS : HOLD_MS;
    const timer = window.setTimeout(() => {
      if (streaming) {
        setCount((current) => current + 1);
        return;
      }
      setRunIndex((current) => (current + 1) % RUNS.length);
      setCount(0);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [count, script.length, streaming, reduce]);

  return (
    <section
      aria-labelledby="cli-stream-heading"
      className="overflow-hidden rounded-2xl border border-white/10 bg-black/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div>
          <p id="cli-stream-heading" className="font-mono text-[11px] tracking-wide text-[#f9fafb]/70">
            <span className="text-purple-400">provix</span>
            <span className="text-[#f9fafb]/35">@</span>
            cli
          </p>
        </div>
        <p className="font-mono text-[11px] text-purple-300">live</p>
      </header>
      <div
        className="min-h-[280px] overflow-x-auto px-4 py-4 sm:px-5"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        <p className="font-mono text-[12px] text-[#f9fafb]/45">
          <span className="text-purple-400">$</span> npx provix@latest
        </p>
        <ul className="mt-3 min-w-[36rem] space-y-1.5">
          <AnimatePresence initial={false}>
            {lines.map((line, index) => {
              const isLatest = index === lines.length - 1 && streaming;
              return (
                <motion.li
                  key={line.id}
                  initial={reduce ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="grid grid-cols-[4.5rem_minmax(0,9rem)_4.25rem_minmax(0,1fr)] items-baseline gap-x-3 font-mono text-[12px] sm:text-[13px]"
                >
                  <span className="text-[#f9fafb]/30">{line.clock}</span>
                  <span className="text-[#f9fafb]/80">{line.label}</span>
                  <motion.span
                    initial={reduce ? false : { opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.08, duration: 0.22 }}
                    className={line.state === "OK" ? "text-[#34d399]" : "text-rose-400"}
                  >
                    {line.state}
                  </motion.span>
                  <TypedDetail text={line.detail} active={isLatest} />
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        <p className="mt-3 font-mono text-[13px] text-purple-400" aria-hidden="true">
          <span className="animate-pulse motion-reduce:animate-none">▌</span>
        </p>
      </div>
    </section>
  );
}
