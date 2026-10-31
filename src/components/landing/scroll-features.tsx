"use client";

import { Boxes, LockKeyhole, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal, SpotlightCard, Stagger, StaggerItem } from "@/components/landing/landing-motion";

type Module = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

const MODULES: readonly Module[] = [
  {
    id: "boundaries",
    title: "Automated Boundary Defense",
    description: "We ensure AI agents respect internal data boundaries and ACL rules.",
    icon: Shield,
  },
  {
    id: "secrets",
    title: "Zero-Day Secret Scrub",
    description: "Automatically detect and replace hardcoded secrets and API keys.",
    icon: LockKeyhole,
  },
  {
    id: "dependencies",
    title: "Dependency Hygiene",
    description: "Lock in clean package.json and tsconfig.json rules, preventing bloat.",
    icon: Boxes,
  },
];

export default function ScrollFeatures(): ReactNode {
  return (
    <Reveal as="section" id="features" aria-labelledby="modules-heading" className="relative mt-28 scroll-mt-24">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-4 top-16 h-[80%] rounded-[2rem] bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.08),transparent_70%)] blur-2xl"
      />
      <div className="relative max-w-xl">
        <p className="font-mono text-[11px] tracking-[0.2em] text-purple-400 uppercase">Platform</p>
        <h2 id="modules-heading" className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#f9fafb] sm:text-4xl">
          Three modules on the gate.
        </h2>
      </div>
      <Stagger className="relative mt-10 grid gap-5 md:grid-cols-3" delay={0.05}>
        {MODULES.map((module) => {
          const Icon = module.icon;
          return (
            <StaggerItem key={module.id}>
              <SpotlightCard className="h-full p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-purple-400/30 bg-purple-500/10 text-purple-400 shadow-[0_0_24px_-10px_rgba(168,85,247,0.9)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-purple-300/50 group-hover:bg-purple-500/15 group-hover:shadow-[0_0_32px_-8px_rgba(168,85,247,1)] group-hover:text-purple-300">
                  <Icon className="h-5 w-5 transition-transform duration-300 group-hover:scale-105" strokeWidth={1.75} aria-hidden="true" />
                </div>
                <h3 className="mt-6 text-lg font-semibold tracking-tight text-[#f9fafb] transition-transform duration-300 group-hover:-translate-y-0.5">
                  {module.title}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[#f9fafb]/75 transition-colors duration-300 group-hover:text-[#f9fafb]/85">
                  {module.description}
                </p>
              </SpotlightCard>
            </StaggerItem>
          );
        })}
      </Stagger>
    </Reveal>
  );
}
