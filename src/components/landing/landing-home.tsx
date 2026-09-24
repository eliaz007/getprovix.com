"use client";

import { useState, type FormEvent } from "react";
import dynamic from "next/dynamic";

function AuditFormSkeleton() {
  return (
    <div className="relative flex min-h-14 flex-col gap-2 overflow-hidden rounded-xl border border-neutral-800/80 bg-[#0d0f17] p-1.5 sm:flex-row sm:items-stretch">
      <div className="min-h-12 flex-1 rounded-lg bg-transparent" />
      <div className="min-h-12 rounded-lg bg-violet-600/40 sm:w-[11.5rem]" />
    </div>
  );
}

const PublicProductionAudit = dynamic(
  () => import("@/components/auditor/public-production-audit"),
  { ssr: false, loading: AuditFormSkeleton }
);

const ComparisonShowcase = dynamic(
  () => import("@/components/ComparisonShowcase"),
  { ssr: true }
);

const LandingAudienceCards = dynamic(
  () => import("@/components/landing/landing-audience-cards"),
  { ssr: true }
);

export default function LandingHome() {
  const [hasAuditResults, setHasAuditResults] = useState(false);
  const [draftRepoUrl, setDraftRepoUrl] = useState("");
  const [auditReady, setAuditReady] = useState(false);

  const openAudit = () => {
    setAuditReady(true);
  };

  const onSkeletonSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    openAudit();
  };

  return (
    <>
      <div className="mx-auto mt-6 w-full max-w-4xl text-left">
        {auditReady ? (
          <PublicProductionAudit
            embedded
            showEmptyState={false}
            autoFocus
            initialRepoUrl={draftRepoUrl}
            onHasResultsChange={setHasAuditResults}
          />
        ) : (
          <form
            onSubmit={onSkeletonSubmit}
            className="mx-auto w-full max-w-4xl"
          >
            <div className="relative flex min-h-14 flex-col gap-2 overflow-hidden rounded-xl border border-neutral-800/80 bg-[#0d0f17] p-1.5 transition-colors hover:border-neutral-700/80 sm:flex-row sm:items-stretch">
              <label htmlFor="landing-audit-repo" className="sr-only">
                GitHub repository URL
              </label>
              <input
                id="landing-audit-repo"
                name="repo"
                type="text"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                value={draftRepoUrl}
                placeholder="Paste GitHub repo URL (owner/repository)"
                onChange={(event) => setDraftRepoUrl(event.target.value)}
                onFocus={openAudit}
                className="relative min-h-12 w-full flex-1 rounded-lg border border-transparent bg-transparent px-4 py-3 font-mono text-sm text-white placeholder:text-neutral-500 outline-none sm:text-[15px]"
              />
              <button
                type="submit"
                className="relative inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-violet-600 px-5 text-sm font-medium tracking-tight text-white shadow-[0_0_20px_rgba(124,58,237,0.25)] transition-colors hover:bg-violet-500 sm:w-[11.5rem]"
              >
                Run Production Audit
              </button>
            </div>
          </form>
        )}
      </div>
      {!hasAuditResults ? (
        <>
          <ComparisonShowcase />
          <LandingAudienceCards />
        </>
      ) : null}
    </>
  );
}
