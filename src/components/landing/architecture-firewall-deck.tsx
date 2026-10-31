"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

type ScenarioId =
  | "UNHANDLED_SERVER_ACTION"
  | "MONOLITH_BLOAT"
  | "EXPOSED_SUPABASE_RLS";

type Severity = "CRITICAL" | "HIGH" | "ARCHITECTURAL_ROT";

type Phase = "vulnerable" | "patched";

type DiffKind = "context" | "remove" | "add";

type DiffLine = {
  id: string;
  line: number;
  kind: DiffKind;
  text: string;
};

type LogStep = {
  node: string;
  detail: string;
};

type Scenario = {
  id: ScenarioId;
  tab: string;
  filePath: string;
  severity: Severity;
  summary: string;
  logs: readonly LogStep[];
  vulnerable: readonly DiffLine[];
  patched: readonly DiffLine[];
};

const CYCLE_MS = 4500;
const PATCH_AT_MS = 2250;

const SPRING = { type: "spring" as const, stiffness: 350, damping: 30 };

const SCENARIOS: readonly Scenario[] = [
  {
    id: "UNHANDLED_SERVER_ACTION",
    tab: "UNHANDLED_SERVER_ACTION",
    filePath: "app/actions/checkout.ts",
    severity: "CRITICAL",
    summary: "Missing try/catch and Zod validation on a server action.",
    logs: [
      { node: "FunctionDeclaration", detail: "checkout(input: unknown) @ L4" },
      { node: "CallExpression", detail: "CheckoutSchema.safeParse — ABSENT" },
      { node: "AwaitExpression", detail: "supabase.from(\"orders\").insert" },
      { node: "TryStatement", detail: "handler body — NOT FOUND" },
    ],
    vulnerable: [
      { id: "c-fn", line: 4, kind: "context", text: "export async function checkout(input: unknown) {" },
      { id: "v-cast", line: 5, kind: "remove", text: "  const body = input as CheckoutInput;" },
      { id: "v-await", line: 6, kind: "remove", text: "  const { data } = await supabase.from(\"orders\").insert(body);" },
      { id: "v-ret", line: 7, kind: "remove", text: "  return data;" },
      { id: "c-end", line: 8, kind: "context", text: "}" },
    ],
    patched: [
      { id: "c-fn", line: 4, kind: "context", text: "export async function checkout(input: unknown) {" },
      { id: "p-parse", line: 5, kind: "add", text: "  const parsed = CheckoutSchema.safeParse(input);" },
      { id: "p-guard", line: 6, kind: "add", text: "  if (!parsed.success) return { ok: false, message: \"Invalid checkout.\" };" },
      { id: "p-try", line: 7, kind: "add", text: "  try {" },
      { id: "p-await", line: 8, kind: "add", text: "    const { error } = await supabase.from(\"orders\").insert(parsed.data);" },
      { id: "p-throw", line: 9, kind: "add", text: "    if (error) throw error;" },
      { id: "p-ok", line: 10, kind: "add", text: "    return { ok: true };" },
      { id: "p-catch", line: 11, kind: "add", text: "  } catch {" },
      { id: "p-fail", line: 12, kind: "add", text: "    return { ok: false, message: \"Checkout failed.\" };" },
      { id: "p-endtry", line: 13, kind: "add", text: "  }" },
      { id: "c-end", line: 14, kind: "context", text: "}" },
    ],
  },
  {
    id: "MONOLITH_BLOAT",
    tab: "MONOLITH_BLOAT",
    filePath: "components/dashboard.tsx",
    severity: "ARCHITECTURAL_ROT",
    summary: "1,400-line generated component collapsed into module imports.",
    logs: [
      { node: "SourceFile", detail: "dashboard.tsx — 1,412 lines" },
      { node: "ImportDeclaration", detail: "distinct imports 22 / limit 15" },
      { node: "FunctionDeclaration", detail: "Dashboard, Chart, Table, Filters — same file" },
      { node: "ExportAssignment", detail: "barrel required at components/dashboard.tsx" },
    ],
    vulnerable: [
      { id: "m-c1", line: 1, kind: "context", text: "\"use client\";" },
      { id: "m-v1", line: 18, kind: "remove", text: "function MetricChart() { /* 380 lines */ }" },
      { id: "m-v2", line: 410, kind: "remove", text: "function ActivityTable() { /* 510 lines */ }" },
      { id: "m-v3", line: 930, kind: "remove", text: "function FilterRail() { /* 470 lines */ }" },
      { id: "m-c2", line: 1412, kind: "context", text: "export default function Dashboard() { /* ... */ }" },
    ],
    patched: [
      { id: "m-c1", line: 1, kind: "context", text: "\"use client\";" },
      { id: "m-p1", line: 3, kind: "add", text: "import { MetricChart } from \"./dashboard/metric-chart\";" },
      { id: "m-p2", line: 4, kind: "add", text: "import { ActivityTable } from \"./dashboard/activity-table\";" },
      { id: "m-p3", line: 5, kind: "add", text: "import { FilterRail } from \"./dashboard/filter-rail\";" },
      { id: "m-c2", line: 12, kind: "context", text: "export default function Dashboard() { /* composed */ }" },
    ],
  },
  {
    id: "EXPOSED_SUPABASE_RLS",
    tab: "EXPOSED_SUPABASE_RLS",
    filePath: "supabase/migrations/01_rls.sql",
    severity: "HIGH",
    summary: "Public table read locked to auth.uid().",
    logs: [
      { node: "CreateTable", detail: "public.orders — RLS DISABLED" },
      { node: "Policy", detail: "SELECT USING (true) — world readable" },
      { node: "Grant", detail: "anon, authenticated — ALL" },
      { node: "AuthClaim", detail: "auth.uid() predicate — ABSENT" },
    ],
    vulnerable: [
      { id: "r-c1", line: 4, kind: "context", text: "create table public.orders (" },
      { id: "r-c2", line: 8, kind: "context", text: ");" },
      { id: "r-v1", line: 10, kind: "remove", text: "-- row level security not enabled" },
      { id: "r-v2", line: 11, kind: "remove", text: "grant select on public.orders to anon;" },
    ],
    patched: [
      { id: "r-c1", line: 4, kind: "context", text: "create table public.orders (" },
      { id: "r-c2", line: 8, kind: "context", text: ");" },
      { id: "r-p1", line: 10, kind: "add", text: "alter table public.orders enable row level security;" },
      { id: "r-p2", line: 12, kind: "add", text: "create policy \"own_orders\" on public.orders" },
      { id: "r-p3", line: 13, kind: "add", text: "  for select to authenticated" },
      { id: "r-p4", line: 14, kind: "add", text: "  using (auth.uid() = user_id);" },
    ],
  },
];

function nextScenario(id: ScenarioId): ScenarioId {
  const index = SCENARIOS.findIndex((scenario) => scenario.id === id);
  const following = SCENARIOS[(index + 1) % SCENARIOS.length];
  return following?.id ?? SCENARIOS[0].id;
}

function visibleLines(scenario: Scenario, phase: Phase): readonly DiffLine[] {
  return phase === "vulnerable" ? scenario.vulnerable : scenario.patched;
}

export default function ArchitectureFirewallDeck(): ReactNode {
  const [scenarioId, setScenarioId] = useState<ScenarioId>(SCENARIOS[0].id);
  const [phase, setPhase] = useState<Phase>("vulnerable");
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);

  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[0];
  const stepMs = CYCLE_MS / scenario.logs.length;

  useEffect(() => {
    setPhase("vulnerable");
    setStep(0);

    const stepTimers = scenario.logs.map((_, index) =>
      window.setTimeout(() => setStep(index), index * stepMs)
    );
    const patchTimer = window.setTimeout(() => setPhase("patched"), PATCH_AT_MS);
    const cycleTimer = window.setTimeout(() => {
      setScenarioId((current) => nextScenario(current));
    }, CYCLE_MS);

    return () => {
      stepTimers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(patchTimer);
      window.clearTimeout(cycleTimer);
    };
  }, [scenarioId, run, scenario.logs, stepMs]);

  function selectScenario(id: ScenarioId) {
    setScenarioId(id);
    setRun((value) => value + 1);
  }

  const patched = phase === "patched";
  const lines = visibleLines(scenario, phase);

  return (
    <section
      aria-label="Architecture firewall engine"
      className="w-full overflow-hidden rounded-[11px] border border-white/[0.08] bg-[#09090b] text-left shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]"
    >
      <header className="grid grid-cols-1 items-center gap-3 border-b border-white/[0.08] px-3 py-3 sm:px-4 lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400" />
          <p className="font-mono text-[11px] tracking-wide text-zinc-300">
            PROVIX_AST_ENGINE // v2.4.0
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-1" role="tablist" aria-label="Scan targets">
          {SCENARIOS.map((item) => {
            const selected = item.id === scenario.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectScenario(item.id)}
                className={`rounded-md border px-2.5 py-1 font-mono text-[10px] tracking-wide transition-colors ${
                  selected
                    ? "border-white/20 bg-white/[0.06] text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {item.tab}
              </button>
            );
          })}
        </div>

        <p className="text-left font-mono text-[10px] tracking-wide text-zinc-500 lg:text-right">
          SCAN_TIME: 14ms | STATUS: ENFORCING
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr]">
        <div className="border-b border-white/[0.08] bg-black/60 p-4 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] tracking-[0.16em] text-zinc-500 uppercase">
              AST telemetry
            </p>
            <span
              className={`rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide ${
                patched
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-red-500/30 bg-red-500/10 text-red-400"
              }`}
            >
              {scenario.severity}
            </span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-zinc-400">{scenario.summary}</p>
          <ol className="mt-4 space-y-2">
            {scenario.logs.map((entry, index) => {
              const active = index === step;
              const done = index < step || patched;
              return (
                <li key={entry.node}>
                  <div className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
                    <span className={done ? "text-zinc-200" : "text-zinc-500"}>{entry.node}</span>
                    <span className="truncate text-zinc-500">{entry.detail}</span>
                  </div>
                  {active ? (
                    <div className="mt-1.5 h-px overflow-hidden bg-white/[0.06]">
                      <motion.div
                        key={`${scenario.id}-${run}-${index}`}
                        className={`h-full ${patched ? "bg-emerald-400" : "bg-red-400"}`}
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: stepMs / 1000, ease: "linear" }}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="bg-black/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
            <p className="font-mono text-[11px] text-zinc-300">{scenario.filePath}</p>
            <motion.p
              layout
              key={phase}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING}
              className={`font-mono text-[10px] tracking-wide ${
                patched ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {patched ? "STATE: AUTO_PATCHED" : "STATE: VULNERABLE_COMMIT"}
            </motion.p>
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.08] bg-[#09090b]">
            <AnimatePresence mode="popLayout" initial={false}>
              {lines.map((entry) => (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={SPRING}
                  className={`grid grid-cols-[2.5rem_1fr] overflow-hidden font-mono text-xs leading-5 ${
                    entry.kind === "remove"
                      ? "border-l-2 border-red-500 bg-red-500/10 text-red-200"
                      : entry.kind === "add"
                        ? "border-l-2 border-emerald-500 bg-emerald-500/10 text-emerald-200"
                        : "border-l-2 border-transparent text-zinc-400"
                  }`}
                >
                  <span className="px-2 text-right text-zinc-600 select-none">{entry.line}</span>
                  <span className="pr-3 whitespace-pre">
                    {entry.kind === "remove" ? "- " : entry.kind === "add" ? "+ " : "  "}
                    {entry.text}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
