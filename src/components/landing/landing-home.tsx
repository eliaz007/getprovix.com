"use client";

import { useState, type ComponentType, type FormEvent } from "react";
import ComparisonShowcase from "@/components/ComparisonShowcase";
import LandingAudienceCards from "@/components/landing/landing-audience-cards";

type AuditComponent = ComponentType<{
  embedded?: boolean;
  showEmptyState?: boolean;
  autoFocus?: boolean;
  initialRepoUrl?: string;
  onHasResultsChange?: (hasResults: boolean) => void;
}>;

export default function LandingHome() {
  const [hasAuditResults, setHasAuditResults] = useState(false);
  const [draftRepoUrl, setDraftRepoUrl] = useState("");
  const [AuditForm, setAuditForm] = useState<AuditComponent | null>(null);

  const openAudit = () => {
    if (AuditForm) {
      return;
    }
    void import("@/components/auditor/public-production-audit").then(
      (mod) => {
        setAuditForm(() => mod.default);
      }
    );
  };

  const onSkeletonSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    openAudit();
  };

  return (
    <>
      <div className="mx-auto mt-6 w-full max-w-4xl text-left">
        {AuditForm ? (
          <AuditForm
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
            <div className="relative flex flex-col gap-2 overflow-hidden rounded-xl border border-neutral-800/80 bg-[#0d0f17] p-1.5 transition-colors hover:border-neutral-700/80 sm:flex-row sm:items-stretch">
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
                className="relative min-h-12 w-full rounded-lg border border-transparent bg-transparent px-4 py-3 font-mono text-sm text-white placeholder:text-neutral-500 outline-none sm:text-[15px]"
              />
              <button
                type="submit"
                className="relative inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-violet-600 px-5 text-sm font-medium tracking-tight text-white shadow-[0_0_20px_rgba(124,58,237,0.25)] transition-colors hover:bg-violet-500"
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
