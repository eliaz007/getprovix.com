'use client';

import React, { useState } from 'react';

export default function ComparisonShowcase() {
  const [activeTab, setActiveTab] = useState<'provix' | 'boards'>('provix');

  return (
    <section className="relative py-16 px-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2 mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          A better way to get hired.
        </h2>
        <p className="text-sm text-neutral-400 max-w-md mx-auto">
          See how the hiring process changes when verified code replaces keyword resumes.
        </p>
        {/* Tab Toggle */}
        <div className="pt-4 flex justify-center">
          <div className="inline-flex rounded-full border border-neutral-800 bg-[#0d0e12] p-1 shadow-inner">
            <button
              type="button"
              onClick={() => setActiveTab('boards')}
              className={`px-4 py-1.5 rounded-full text-xs font-mono transition-all duration-300 ${
                activeTab === 'boards'
                  ? 'bg-neutral-800 text-neutral-200 border border-neutral-700 shadow-sm'
                  : 'text-neutral-400 hover:text-white border border-transparent'
              }`}
            >
              Standard Job Boards
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('provix')}
              className={`px-4 py-1.5 rounded-full text-xs font-mono transition-all duration-300 ${
                activeTab === 'provix'
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                  : 'text-neutral-400 hover:text-white border border-transparent'
              }`}
            >
              Provix Network
            </button>
          </div>
        </div>
      </div>
      {/* Card Content */}
      <div className="relative min-h-[360px]">
        {activeTab === 'boards' ? (
          <div
            key="boards"
            className="animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-2xl border border-neutral-800 bg-[#0b0c10] p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-900">
              <span className="font-mono text-xs text-neutral-400">The Traditional Process</span>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                High Effort, Low Yield
              </span>
            </div>
            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 rounded-lg border border-neutral-800/80 bg-neutral-900/30">
                <span className="text-[11px] text-neutral-500 block uppercase">1. How You Apply</span>
                <span className="text-sm font-semibold text-neutral-200 mt-1 block">Submit 100+ blind applications</span>
                <span className="text-neutral-400 text-[11px] mt-1 block">Your PDF sits in an automated resume filter alongside 500 other applicants.</span>
              </div>
              <div className="p-3 rounded-lg border border-neutral-800/80 bg-neutral-900/30">
                <span className="text-[11px] text-neutral-500 block uppercase">2. The Technical Screen</span>
                <span className="text-sm font-semibold text-neutral-200 mt-1 block">Unpaid multi-day take-homes & whiteboard trivia</span>
                <span className="text-neutral-400 text-[11px] mt-1 block">Spend days on an unpaid assignment, then defend live whiteboard trivia that has nothing to do with the job.</span>
              </div>
              <div className="p-3 rounded-lg border border-neutral-800/80 bg-neutral-900/30">
                <span className="text-[11px] text-neutral-500 block uppercase">3. The Interaction</span>
                <span className="text-sm font-semibold text-neutral-200 mt-1 block">Recruiter outreach & ghosting</span>
                <span className="text-neutral-400 text-[11px] mt-1 block">Initial calls are held with non-technical recruiters reading from a script.</span>
              </div>
            </div>
            <div className="pt-3 border-t border-neutral-900 flex justify-between items-center font-mono text-xs text-neutral-500">
              <span>Typical Response Rate:</span>
              <span className="text-red-400">Under 5%</span>
            </div>
          </div>
        ) : (
          <div
            key="provix"
            className="animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-2xl border border-emerald-500/30 bg-[#0c0d12] p-6 space-y-4 shadow-[0_15px_40px_rgba(16,185,129,0.08)]"
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <span className="font-mono text-xs text-white">The Provix Talent Network</span>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Verified Standards
              </span>
            </div>
            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 rounded-lg border border-neutral-800 bg-neutral-900/60">
                <span className="text-[11px] text-emerald-400/80 block uppercase">1. How You Apply</span>
                <span className="text-sm font-semibold text-white mt-1 block">Connect a public, private, or enterprise codebase once</span>
                <span className="text-neutral-400 text-[11px] mt-1 block">Provix verifies tests, CI/CD, and TypeScript hygiene without exposing private IP. Your profile is automatically published.</span>
              </div>
              <div className="p-3 rounded-lg border border-neutral-800 bg-neutral-900/60">
                <span className="text-[11px] text-emerald-400/80 block uppercase">2. The Technical Screen</span>
                <span className="text-sm font-semibold text-white mt-1 block">Bypassed by verified production code</span>
                <span className="text-neutral-400 text-[11px] mt-1 block">Hiring teams can already see your passing test suites and workflow configurations.</span>
              </div>
              <div className="p-3 rounded-lg border border-neutral-800 bg-neutral-900/60">
                <span className="text-[11px] text-emerald-400/80 block uppercase">3. The Interaction</span>
                <span className="text-sm font-semibold text-white mt-1 block">Direct inbound from technical founders</span>
                <span className="text-neutral-400 text-[11px] mt-1 block">Founders message you directly based on the exact tools and standards you use.</span>
              </div>
            </div>
            <div className="pt-3 border-t border-neutral-800 flex justify-between items-center font-mono text-xs">
              <span className="text-neutral-400">Founder Match Quality:</span>
              <span className="text-emerald-400 font-semibold">High Signal • Zero Keyword Games</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
