"use client";

import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal, SpotlightCard, Stagger, StaggerItem } from "@/components/landing/landing-motion";

type Tone = "plain" | "risk" | "fixed" | "added";

type TreeNode = {
  id: string;
  kind: string;
  label: string;
  tone: Tone;
  children?: TreeNode[];
};

const BEFORE: TreeNode[] = [
  {
    id: "before-file",
    kind: "SourceFile",
    label: "app/checkout/page.tsx",
    tone: "plain",
    children: [
      {
        id: "before-secret",
        kind: "VariableDeclaration",
        label: 'const STRIPE_KEY = "sk_live_51…"',
        tone: "risk",
      },
      {
        id: "before-call",
        kind: "CallExpression",
        label: "stripe.charges.create({ apiKey: STRIPE_KEY })",
        tone: "plain",
      },
    ],
  },
];

const AFTER: TreeNode[] = [
  {
    id: "after-file",
    kind: "SourceFile",
    label: "app/checkout/page.tsx",
    tone: "plain",
    children: [
      {
        id: "after-import",
        kind: "ImportDeclaration",
        label: 'import { createClient } from "@/utils/supabase/server"',
        tone: "added",
      },
      {
        id: "after-secret",
        kind: "AwaitExpression",
        label: 'const key = await getSecret("STRIPE_KEY")',
        tone: "fixed",
      },
      {
        id: "after-call",
        kind: "CallExpression",
        label: "stripe.charges.create({ apiKey: key })",
        tone: "plain",
      },
    ],
  },
];

const TONE_CLASS: Record<Tone, string> = {
  plain: "border-white/10 bg-white/[0.04]",
  risk: "border-rose-400/35 bg-rose-500/[0.08]",
  fixed: "border-[#34d399]/40 bg-[#34d399]/10",
  added: "border-purple-400/40 bg-purple-500/10",
};

function NodeBadge({ tone }: { tone: Tone }): ReactNode {
  if (tone === "risk") {
    return (
      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-rose-300 uppercase">
        Secret
      </span>
    );
  }
  if (tone === "fixed") {
    return (
      <span className="rounded-full bg-[#34d399]/15 px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-[#34d399] uppercase">
        Fixed
      </span>
    );
  }
  if (tone === "added") {
    return (
      <span className="rounded-full bg-purple-500/15 px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-purple-400 uppercase">
        Added
      </span>
    );
  }
  return null;
}

function Tree({ nodes, depth = 0 }: { nodes: TreeNode[]; depth?: number }): ReactNode {
  return (
    <ul className={depth === 0 ? "space-y-3" : "mt-3 space-y-3 border-l border-white/10 pl-4"}>
      {nodes.map((node) => (
        <li key={node.id} className="relative">
          {depth > 0 ? (
            <span aria-hidden="true" className="absolute top-[22px] -left-4 h-px w-4 bg-white/10" />
          ) : null}
          <div className={`rounded-xl border px-3.5 py-3 backdrop-blur-sm ${TONE_CLASS[node.tone]}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] tracking-[0.16em] text-[#f9fafb]/45 uppercase">{node.kind}</p>
              <NodeBadge tone={node.tone} />
            </div>
            <p className="mt-1.5 font-mono text-[12.5px] leading-relaxed break-words text-[#f9fafb]">{node.label}</p>
          </div>
          {node.children ? <Tree nodes={node.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

function Panel({
  kicker,
  title,
  status,
  statusClass,
  nodes,
}: {
  kicker: string;
  title: string;
  status: string;
  statusClass: string;
  nodes: TreeNode[];
}): ReactNode {
  return (
    <SpotlightCard className="h-full p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-[#f9fafb]/40 uppercase">{kicker}</p>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-[#f9fafb]">{title}</h3>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] uppercase ${statusClass}`}>
          {status}
        </span>
      </div>
      <Tree nodes={nodes} />
    </SpotlightCard>
  );
}

export default function AstCompare(): ReactNode {
  return (
    <Reveal as="section" aria-labelledby="ast-compare-heading" className="relative mt-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 top-24 h-[70%] rounded-[2rem] bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.1),transparent_72%)] blur-2xl"
      />
      <div className="relative max-w-2xl">
        <p className="font-mono text-[11px] tracking-[0.2em] text-purple-400 uppercase">AST validation</p>
        <h2 id="ast-compare-heading" className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#f9fafb] sm:text-4xl">
          Before and after, on the same tree.
        </h2>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#f9fafb]/70">
          A hardcoded key is rewritten to <span className="font-mono text-[#f9fafb]">getSecret()</span> and the{" "}
          <span className="font-mono text-[#f9fafb]">createClient</span> server import is added before the pull request opens.
        </p>
      </div>

      <Stagger className="relative mt-10 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-5">
        <StaggerItem>
          <Panel
            kicker="Before"
            title="Hardcoded secret"
            status="Risk"
            statusClass="bg-rose-500/15 text-rose-300"
            nodes={BEFORE}
          />
        </StaggerItem>
        <StaggerItem className="flex items-center justify-center lg:px-1">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-purple-400/30 bg-purple-500/10 text-purple-400 shadow-[0_0_24px_-8px_rgba(168,85,247,0.9)] backdrop-blur-sm"
          >
            <ArrowRight className="h-4 w-4 rotate-90 lg:rotate-0" strokeWidth={1.75} />
          </span>
        </StaggerItem>
        <StaggerItem>
          <Panel
            kicker="After"
            title="Server action"
            status="Resolved"
            statusClass="bg-[#34d399]/15 text-[#34d399]"
            nodes={AFTER}
          />
        </StaggerItem>
      </Stagger>
    </Reveal>
  );
}
