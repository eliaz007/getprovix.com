"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Reveal } from "@/components/landing/landing-motion";
import RunnerReadout from "@/components/runner-readout";
import type { RunnerCheck, RunnerStatus } from "@/lib/firewall-runner";

type Run = {
  status: RunnerStatus;
  checks: readonly RunnerCheck[];
};

const FAILED_RUN: Run = {
  status: "FAILED",
  checks: [
    { id: "ast", label: "AST_PARSE", state: "OK", detail: "SourceFile app/checkout/page.tsx" },
    { id: "boundary", label: "BOUNDARY_CHECK", state: "FAILED", detail: "secret bound on the client tree" },
    { id: "secret", label: "SECRET_SCAN", state: "FAILED", detail: 'STRIPE_KEY = "sk_live_…"' },
    { id: "immutable", label: "IMMUTABLE_CHECK", state: "OK", detail: "server boundary sealed" },
    { id: "deps", label: "DEPENDENCY_FLOOR", state: "OK", detail: "package.json held" },
  ],
};

const PASSED_RUN: Run = {
  status: "PASSED",
  checks: [
    { id: "ast", label: "AST_PARSE", state: "OK", detail: "SourceFile app/checkout/page.tsx" },
    { id: "boundary", label: "BOUNDARY_CHECK", state: "OK", detail: 'await getSecret("STRIPE_KEY")' },
    { id: "secret", label: "SECRET_SCAN", state: "OK", detail: "no hardcoded keys" },
    { id: "immutable", label: "IMMUTABLE_CHECK", state: "OK", detail: "createClient on the server" },
    { id: "deps", label: "DEPENDENCY_FLOOR", state: "OK", detail: "package.json held" },
  ],
};

const RUNS = [FAILED_RUN, PASSED_RUN] as const;
const TICK_MS = 420;
const HOLD_MS = 1700;

export default function PipelineFlow(): ReactNode {
  const [runIndex, setRunIndex] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const run = RUNS[runIndex] ?? FAILED_RUN;
  const showStatus = revealed > run.checks.length;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setRevealed(run.checks.length + 1);
      return;
    }

    const delay = showStatus ? HOLD_MS : TICK_MS;
    const timer = window.setTimeout(() => {
      if (!showStatus) {
        setRevealed((current) => current + 1);
        return;
      }
      setRunIndex((current) => (current + 1) % RUNS.length);
      setRevealed(0);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [revealed, run.checks.length, showStatus]);

  return (
    <Reveal as="section" aria-labelledby="pipeline-heading" className="relative mt-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 top-20 h-[75%] rounded-[2rem] bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.12),transparent_72%)] blur-2xl"
      />
      <div className="relative max-w-2xl">
        <p className="font-mono text-[11px] tracking-[0.2em] text-purple-400 uppercase">Runner</p>
        <h2 id="pipeline-heading" className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#f9fafb] sm:text-4xl">
          STATUS: PASSED or FAILED.
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-[#f9fafb]/70">
          AST parse, boundary check, secret scan, immutable check, and the dependency floor each return OK or FAILED.
        </p>
      </div>
      <div className="relative mt-10">
        <RunnerReadout
          target="app/checkout/page.tsx"
          checks={run.checks}
          status={run.status}
          revealed={reduceRevealed(revealed, run.checks.length)}
          showStatus={showStatus}
        />
      </div>
    </Reveal>
  );
}

function reduceRevealed(revealed: number, total: number): number {
  return Math.min(revealed, total);
}
