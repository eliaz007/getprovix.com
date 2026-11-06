"use client";

import type { ReactNode } from "react";

type Module = {
  id: string;
  index: string;
  title: string;
  description: string;
};

const MODULES: readonly Module[] = [
  {
    id: "boundaries",
    index: "03.1",
    title: "Structure checks",
    description: "Catch oversized modules and boundary problems, then open a fix PR when it is safe.",
  },
  {
    id: "secrets",
    index: "03.2",
    title: "Secret scrubbing",
    description: "Find hardcoded API keys and secrets before they land on main.",
  },
  {
    id: "dependencies",
    index: "03.3",
    title: "Dependency safety",
    description: "Flag risky or outdated packages that weaken the repo.",
  },
];

export default function ScrollFeatures(): ReactNode {
  return (
    <section id="features" aria-labelledby="modules-heading" className="relative scroll-mt-24 border-b border-white/10">
      <div className="px-6 py-12 sm:px-10">
        <p className="font-mono text-xs tracking-widest text-[#a1a1aa] uppercase">[ 03 // Checks ]</p>
        <h2
          id="modules-heading"
          className="mt-3 max-w-2xl text-3xl font-medium tracking-[-0.03em] text-[#ededed] sm:text-4xl"
        >
          What Provix checks.
        </h2>
      </div>
      <div className="grid grid-cols-1 divide-y divide-white/10 border-t border-white/10 md:grid-cols-3 md:divide-x md:divide-y-0">
        {MODULES.map((module) => (
          <article key={module.id} className="bg-[#141414] px-6 py-8 sm:px-10">
            <p className="font-mono text-[11px] tracking-widest text-[#c4b5fd]">{module.index}</p>
            <h3 className="mt-4 text-lg font-medium tracking-[-0.03em] text-[#ededed]">{module.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-[#a1a1aa]">{module.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
