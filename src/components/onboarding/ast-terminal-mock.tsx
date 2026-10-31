"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";

type LineKind = "meta" | "scan" | "pass" | "fail" | "info";

type TerminalLine = {
  id: string;
  kind: LineKind;
  text: string;
};

const SCRIPT: Omit<TerminalLine, "id">[] = [
  { kind: "meta", text: "provix-ast-engine v1.0.4 — architecture firewall" },
  { kind: "info", text: "mounting telemetry stream… ok" },
  { kind: "scan", text: "scanning auth boundaries" },
  { kind: "pass", text: "auth.getUser() gate present on server actions" },
  { kind: "scan", text: "scanning RLS policy surface" },
  { kind: "pass", text: "row-level security markers detected" },
  { kind: "scan", text: "scanning client DB exposure" },
  { kind: "fail", text: "client .from() query without server action" },
  { kind: "scan", text: "scanning dependency advisories" },
  { kind: "pass", text: "no critical CVEs in lockfile sample" },
  { kind: "info", text: "telemetry idle — awaiting repository handshake" },
];

function LineIcon({ kind }: { kind: LineKind }) {
  if (kind === "pass") return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />;
  if (kind === "fail") return <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden />;
  if (kind === "scan") return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-300" aria-hidden />;
  return <Circle className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />;
}

function lineColor(kind: LineKind): string {
  if (kind === "pass") return "text-emerald-300/90";
  if (kind === "fail") return "text-rose-300/90";
  if (kind === "scan") return "text-violet-200/90";
  if (kind === "meta") return "text-zinc-100";
  return "text-zinc-400";
}

export default function AstTerminalMock() {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [cursorOn, setCursorOn] = useState(true);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    SCRIPT.forEach((entry, index) => {
      timers.push(
        setTimeout(() => {
          setLines((current) => [
            ...current,
            { ...entry, id: `${entry.kind}-${index}-${Date.now()}` },
          ]);
        }, 420 + index * 720)
      );
    });

    const loop = setInterval(() => {
      setLines([]);
      SCRIPT.forEach((entry, index) => {
        timers.push(
          setTimeout(() => {
            setLines((current) => [
              ...current.slice(-10),
              { ...entry, id: `${entry.kind}-${index}-${Date.now()}` },
            ]);
          }, index * 720)
        );
      });
    }, SCRIPT.length * 720 + 4200);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(loop);
    };
  }, []);

  useEffect(() => {
    const blink = setInterval(() => setCursorOn((v) => !v), 530);
    return () => clearInterval(blink);
  }, []);

  return (
    <div className="relative flex h-full min-h-[420px] w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-[0_0_0_1px_rgba(139,92,246,0.08)]">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="ml-3 font-mono text-[11px] tracking-wide text-zinc-500">
          provix-ast-engine · live telemetry
        </span>
      </div>
      <div className="relative flex-1 overflow-hidden px-4 py-4 font-mono text-[12px] leading-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "100% 24px",
          }}
        />
        <ul className="relative space-y-1.5">
          <AnimatePresence initial={false}>
            {lines.map((line) => (
              <motion.li
                key={line.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className={`flex items-start gap-2 ${lineColor(line.kind)}`}
              >
                <LineIcon kind={line.kind} />
                <span>
                  <span className="text-zinc-600">› </span>
                  {line.text}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
          <li className="flex items-center gap-2 text-zinc-500">
            <Circle className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
            <span>
              <span className="text-zinc-600">› </span>
              <span
                className={`inline-block h-3.5 w-1.5 translate-y-0.5 bg-violet-400/80 ${
                  cursorOn ? "opacity-100" : "opacity-0"
                }`}
              />
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
