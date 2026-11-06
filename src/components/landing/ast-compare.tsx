"use client";

import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/landing-motion";

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
  plain: "border-white/10 bg-[#18181B]",
  risk: "border-[#ef4444]/30 bg-[#ef4444]/10",
  fixed: "border-[#10b981]/40 bg-[#10b981]/10",
  added: "border-white/10 bg-[#18181B]",
};

function NodeBadge({ tone }: { tone: Tone }): ReactNode {
  if (tone === "risk") {
    return (
      <span className="rounded-full bg-[#ef4444]/10 px-2 py-0.5 text-[10px] font-medium tracking-[0.14em] text-[#ef4444] uppercase">
        Secret
      </span>
    );
  }
  if (tone === "fixed") {
    return (
      <span className="rounded-full bg-[#10b981]/10 px-2 py-0.5 text-[10px] font-medium tracking-[0.14em] text-[#10b981] uppercase">
        Fixed
      </span>
    );
  }
  if (tone === "added") {
    return (
      <span className="rounded-full bg-[#18181B] px-2 py-0.5 text-[10px] font-medium tracking-[0.14em] text-[#a1a1aa] uppercase">
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
            <span aria-hidden="true" className="absolute top-[22px] -left-4 h-px w-4 bg-[#18181B]" />
          ) : null}
          <div className={`rounded-none border px-3.5 py-3 ${TONE_CLASS[node.tone]}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] tracking-[0.16em] text-[#a1a1aa] uppercase">{node.kind}</p>
              <NodeBadge tone={node.tone} />
            </div>
            <p className="mt-1.5 font-mono text-[12.5px] leading-relaxed break-words text-[#ededed]">{node.label}</p>
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
    <article className="h-full rounded-none border border-white/10 bg-[#141414] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium tracking-[0.18em] text-[#a1a1aa] uppercase">{kicker}</p>
          <h3 className="mt-1 text-base font-medium tracking-tight text-[#ededed]">{title}</h3>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] uppercase ${statusClass}`}>
          {status}
        </span>
      </div>
      <Tree nodes={nodes} />
    </article>
  );
}

export default function AstCompare(): ReactNode {
  return (
    <Reveal as="section" aria-labelledby="ast-compare-heading" className="border-b border-white/10 px-6 py-16 sm:px-10">
      <div className="max-w-2xl">
        <p className="font-mono text-xs tracking-widest text-[#a1a1aa] uppercase">[ 04 // AST validation ]</p>
        <h2 id="ast-compare-heading" className="mt-3 text-3xl font-medium tracking-[-0.03em] text-[#ededed] sm:text-4xl">
          Before and after, on the same tree.
        </h2>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#a1a1aa]">
          A hardcoded key is rewritten to <span className="font-mono text-[#ededed]">getSecret()</span> and the{" "}
          <span className="font-mono text-[#ededed]">createClient</span> server import is added before the pull request opens.
        </p>
      </div>

      <Stagger className="mt-12 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-5">
        <StaggerItem>
          <Panel
            kicker="Before"
            title="Hardcoded secret"
            status="Risk"
            statusClass="bg-[#ef4444]/10 text-[#ef4444]"
            nodes={BEFORE}
          />
        </StaggerItem>
        <StaggerItem className="flex items-center justify-center lg:px-1">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#141414] text-[#ededed]"
          >
            <ArrowRight className="h-4 w-4 rotate-90 lg:rotate-0" strokeWidth={1.75} />
          </span>
        </StaggerItem>
        <StaggerItem>
          <Panel
            kicker="After"
            title="Server action"
            status="Resolved"
            statusClass="bg-[#10b981]/10 text-[#10b981]"
            nodes={AFTER}
          />
        </StaggerItem>
      </Stagger>
    </Reveal>
  );
}
