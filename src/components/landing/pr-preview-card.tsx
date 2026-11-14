"use client";

import { useState } from "react";

const cardShell =
  "rounded-xl border border-white/10 bg-zinc-950/80 shadow-[0_0_0_1px_rgba(139,92,246,0.08)]";

type TabId = "auth" | "client-db" | "server-action";

type Tab = {
  id: TabId;
  label: string;
  title: string;
  file: string;
  lines: Array<{ kind: "ctx" | "del" | "add" | "meta"; text: string }>;
};

const TABS: Tab[] = [
  {
    id: "auth",
    label: "Auth Session Fix",
    title: "fix(auth): replace spoofable getSession() with getUser()",
    file: "app/actions/profile.ts",
    lines: [
      { kind: "meta", text: "@@ app/actions/profile.ts" },
      { kind: "ctx", text: '  "use server";' },
      { kind: "ctx", text: "  const supabase = await createClient();" },
      {
        kind: "del",
        text: "-  const { data: { session } } = await supabase.auth.getSession();",
      },
      {
        kind: "add",
        text: "+  const { data: { user } } = await supabase.auth.getUser();",
      },
      { kind: "del", text: "-  if (!session?.user) throw new Error(\"Unauthorized\");" },
      { kind: "add", text: "+  if (!user) throw new Error(\"Unauthorized\");" },
    ],
  },
  {
    id: "client-db",
    label: "Client DB Exposure",
    title: "fix(security): move client Supabase query behind a Server Action",
    file: "components/orders-panel.tsx → app/actions/orders.ts",
    lines: [
      { kind: "meta", text: "@@ components/orders-panel.tsx" },
      { kind: "del", text: '- "use client";' },
      {
        kind: "del",
        text: '- const { data } = await supabase.from("orders").select("*");',
      },
      { kind: "meta", text: "@@ app/actions/orders.ts" },
      { kind: "add", text: '+ "use server";' },
      {
        kind: "add",
        text: "+ const { data: { user } } = await supabase.auth.getUser();",
      },
      {
        kind: "add",
        text: '+ const { data } = await supabase.from("orders").select("*");',
      },
    ],
  },
  {
    id: "server-action",
    label: "Server Action Validation",
    title: "fix(security): require getUser() before Server Action mutation",
    file: "app/actions/billing.ts",
    lines: [
      { kind: "meta", text: "@@ app/actions/billing.ts" },
      { kind: "ctx", text: "export async function deleteInvoice(invoiceId: string) {" },
      { kind: "ctx", text: "  const supabase = await createClient();" },
      {
        kind: "add",
        text: "+  const { data: { user } } = await supabase.auth.getUser();",
      },
      { kind: "add", text: '+  if (!user) throw new Error("Unauthorized");' },
      { kind: "ctx", text: '  await supabase.from("invoices").delete().eq("id", invoiceId);' },
      { kind: "ctx", text: "}" },
    ],
  },
];

function lineClass(kind: Tab["lines"][number]["kind"]): string {
  if (kind === "del") return "border-l-2 border-rose-500 bg-rose-500/10 text-rose-300";
  if (kind === "add") return "border-l-2 border-emerald-500 bg-emerald-500/10 text-emerald-300";
  if (kind === "meta") return "text-zinc-500";
  return "text-zinc-400";
}

const BADGES = ["AST Verified", "tsc --noEmit Passed", "Code Deleted After Scan"] as const;

export default function PrPreviewCard() {
  const [tabId, setTabId] = useState<TabId>("auth");
  const tab = TABS.find((item) => item.id === tabId) ?? TABS[0]!;

  return (
    <section
      id="preview"
      aria-labelledby="preview-heading"
      className="scroll-mt-16 border-t border-white/10 py-14"
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 text-center sm:text-left">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
            What a Provix PR looks like
          </p>
          <h2
            id="preview-heading"
            className="mt-3 text-2xl font-extrabold tracking-tight text-white"
          >
            A real fix, not a warning list
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Provix opens a Pull Request with the patch already written. You review
            it. You merge it.
          </p>
        </div>

        <div className={`${cardShell} overflow-hidden`}>
          <div className="border-b border-white/10 bg-black/40 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                Open
              </span>
              <p className="text-sm font-semibold tracking-tight text-zinc-100">
                #{tabId === "auth" ? "42" : tabId === "client-db" ? "43" : "44"}{" "}
                {tab.title}
              </p>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              <span className="font-medium text-zinc-300">provix-bot</span> opened
              this pull request · {tab.file}
            </p>
          </div>

          <div
            className="flex flex-wrap gap-1 border-b border-white/10 px-3 py-2"
            role="tablist"
            aria-label="Example fixes"
          >
            {TABS.map((item) => {
              const active = item.id === tabId;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTabId(item.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-white/[0.08] text-white"
                      : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <pre className="overflow-x-auto p-3 font-mono text-xs leading-6 sm:p-4">
            {tab.lines.map((line, index) => (
              <div
                key={`${tab.id}-${index}`}
                className={`rounded-sm px-2 whitespace-pre ${lineClass(line.kind)}`}
              >
                {line.text}
              </div>
            ))}
          </pre>

          <div className="border-t border-white/10 px-4 py-3 font-mono text-[11px] text-emerald-400/90 sm:px-5">
            {BADGES.join(" · ")}
          </div>
        </div>
      </div>
    </section>
  );
}
