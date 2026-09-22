'use client';

import React, { useState } from 'react';

export default function ComparisonShowcase() {
  const [activeTab, setActiveTab] = useState<'provix' | 'boards'>('provix');

  return (
    <section className="relative mx-auto max-w-2xl overflow-hidden px-4 py-14">
      <div className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[220px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/8 blur-[100px]" />
      <div className="relative mb-8 space-y-3 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          A better way to get hired.
        </h2>
        <p className="mx-auto max-w-md text-xs text-zinc-400 sm:text-sm">
          Compare the typical hiring funnel with code-first inbound.
        </p>
        <div className="flex justify-center pt-2">
          <div className="inline-flex rounded-full border border-white/[0.08] bg-[#131316]/85 p-1 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setActiveTab('boards')}
              className={`rounded-full border px-4 py-1.5 font-mono text-xs transition-colors duration-200 ${
                activeTab === 'boards'
                  ? 'border-white/[0.1] bg-[#1A1A1E] text-zinc-200 shadow-sm'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Standard Job Boards
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('provix')}
              className={`rounded-full border px-4 py-1.5 font-mono text-xs transition-all duration-200 ${
                activeTab === 'provix'
                  ? 'border-violet-500/25 bg-violet-500/10 text-violet-300 shadow-[0_0_12px_rgba(124,58,237,0.15)]'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Provix Talent Network
            </button>
          </div>
        </div>
      </div>

      <div className="relative rounded-xl border border-white/[0.08] bg-[#131316]/85 p-6 shadow-2xl backdrop-blur-xl transition-colors hover:border-white/[0.12] sm:p-8">
        {activeTab === 'boards' ? (
          <div key="boards" className="animate-in fade-in duration-200 space-y-6">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 font-mono text-xs">
              <span className="text-zinc-400">Pipeline: Traditional Hiring Loop</span>
              <span className="text-red-400/80">&lt; 5% response rate</span>
            </div>
            <div className="relative space-y-6 pl-6 before:absolute before:top-2 before:bottom-2 before:left-2 before:w-px before:bg-white/[0.08]">
              <div className="relative">
                <span className="absolute -left-6 top-1.5 h-2 w-2 rounded-full bg-zinc-600 ring-4 ring-[#131316]" />
                <h4 className="text-sm font-medium text-zinc-200">Submit Blind Applications</h4>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  Upload static PDFs into automated keyword parsers alongside hundreds of identical submissions.
                </p>
              </div>
              <div className="relative">
                <span className="absolute -left-6 top-1.5 h-2 w-2 rounded-full bg-zinc-600 ring-4 ring-[#131316]" />
                <h4 className="text-sm font-medium text-zinc-200">Unpaid Take-Home Tests</h4>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  Spend days building throwaway projects or answering whiteboard trivia before speaking to an engineer.
                </p>
              </div>
              <div className="relative">
                <span className="absolute -left-6 top-1.5 h-2 w-2 rounded-full bg-zinc-600 ring-4 ring-[#131316]" />
                <h4 className="text-sm font-medium text-zinc-200">Recruiter Keyword Screens</h4>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  Initial rounds are gated by non-technical screeners filtering by school or years-of-experience checklists.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div key="provix" className="animate-in fade-in duration-200 space-y-6">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 font-mono text-xs">
              <span className="text-violet-300">Pipeline: Provix Talent Network</span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Verified Inbound
              </span>
            </div>
            <div className="relative space-y-6 pl-6 before:absolute before:top-2 before:bottom-2 before:left-2 before:w-px before:bg-violet-500/20">
              <div className="relative">
                <span className="absolute -left-6 top-1.5 h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(124,58,237,0.55)] ring-4 ring-[#131316]" />
                <h4 className="text-sm font-medium text-white">One-Time Codebase Audit</h4>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  Connect public, private, or enterprise repositories. Provix verifies tests, CI/CD, and architecture health with zero code exposed.
                </p>
              </div>
              <div className="relative">
                <span className="absolute -left-6 top-1.5 h-2 w-2 rounded-full bg-violet-300 shadow-[0_0_10px_rgba(196,181,253,0.45)] ring-4 ring-[#131316]" />
                <h4 className="text-sm font-medium text-white">Verified Engineering Proof</h4>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  Give hiring teams concrete evidence of production hygiene upfront, replacing the need for toy projects and generic filters.
                </p>
              </div>
              <div className="relative">
                <span className="absolute -left-6 top-1.5 h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(124,58,237,0.55)] ring-4 ring-[#131316]" />
                <h4 className="text-sm font-medium text-white">Direct Founder & Lead Inbound</h4>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  Founders contact you directly based on the exact tools, architectures, and engineering standards you ship with.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
