"use client";

import { AnimatePresence, motion } from "framer-motion";
import AuditScanningPanel from "@/components/firewall/audit-scanning-panel";
import FirewallViolationsTable from "@/components/firewall/firewall-violations-table";
import SecurityGuardPanel from "@/components/firewall/security-guard-panel";
import {
  elevatedSurfaceClass,
  mutedLabelClass,
  sectionLabelClass,
} from "@/components/firewall/firewall-ui";
import type { FirewallReport, FirewallScanCoverage } from "@/lib/firewall-contract";
import { partialScanLine } from "@/lib/firewall-repo-access";

type AuditsCommandCenterProps = {
  repoUrl: string;
  onRepoUrlChange: (value: string) => void;
  recentRepos: string[];
  scannedRepoUrl: string | null;
  isScanning: boolean;
  errorMessage: string | null;
  entryNote: string | null;
  coverage: FirewallScanCoverage | null | undefined;
  report: FirewallReport | null;
  onRunAudit: () => void;
  onSelectRepo: (repo: string) => void;
};

export default function AuditsCommandCenter({
  repoUrl,
  onRepoUrlChange,
  recentRepos,
  scannedRepoUrl,
  isScanning,
  errorMessage,
  entryNote,
  coverage,
  report,
  onRunAudit,
  onSelectRepo,
}: AuditsCommandCenterProps) {
  const trimmed = repoUrl.trim();
  const coverageLine = partialScanLine(coverage ?? null);
  const showResults = Boolean(report) && !isScanning;

  return (
    <div className="space-y-4">
      <header className="space-y-1 pb-1">
        <p className="text-xs text-zinc-500">Repo scanner</p>
        <h1 className="text-2xl font-medium tracking-tight text-zinc-50">Audits</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-500">
          Choose a connected repository or paste a GitHub link. Provix scans for secrets, data leaks,
          and database security issues.
        </p>
      </header>

      <AnimatePresence mode="wait">
        {isScanning ? (
          <AuditScanningPanel key="scanning" repo={scannedRepoUrl} />
        ) : (
          <motion.div
            key="command"
            className="space-y-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <form
              className={`${elevatedSurfaceClass} px-5 py-5 sm:px-6`}
              onSubmit={(event) => {
                event.preventDefault();
                onRunAudit();
              }}
            >
              <label htmlFor="audits-repo-url" className="text-xs text-zinc-500">
                Repository
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id="audits-repo-url"
                  type="text"
                  inputMode="url"
                  value={repoUrl}
                  onChange={(event) => onRepoUrlChange(event.target.value)}
                  placeholder="owner/repo or https://github.com/owner/repo"
                  disabled={isScanning}
                  className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/20 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!trimmed || isScanning}
                  className="shrink-0 rounded-lg bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Run Audit
                </button>
              </div>
              {recentRepos.length > 0 ? (
                <div className="mt-4">
                  <p className={`mb-2 ${mutedLabelClass}`}>Connected repositories</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {recentRepos.map((repo) => {
                      const selected = scannedRepoUrl === repo;
                      return (
                        <li key={repo}>
                          <button
                            type="button"
                            disabled={isScanning}
                            onClick={() => onSelectRepo(repo)}
                            className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left transition-colors disabled:opacity-60 ${
                              selected
                                ? "border-violet-500/35 bg-violet-500/10"
                                : "border-white/[0.06] bg-black/20 hover:border-white/[0.12] hover:bg-white/[0.03]"
                            }`}
                          >
                            <span className="truncate font-mono text-sm text-zinc-200">{repo}</span>
                            <span className="shrink-0 text-xs text-zinc-500">Scan</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </form>

            {errorMessage ? (
              <p
                className="rounded-xl border border-red-500/25 bg-red-500/5 px-5 py-4 text-sm text-red-200"
                role="alert"
              >
                {errorMessage}
              </p>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showResults ? (
          <motion.div
            key="results"
            className="space-y-4"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <section className={`${elevatedSurfaceClass} p-5`}>
              <p className={sectionLabelClass}>Scan complete</p>
              <h2 className="mt-2 truncate text-lg font-medium tracking-tight text-zinc-50">
                {scannedRepoUrl ?? "Repository"}
              </h2>
              {entryNote ? <p className="mt-1 max-w-3xl text-sm text-zinc-500">{entryNote}</p> : null}
              {coverageLine ? <p className="mt-2 text-sm text-amber-200/90">{coverageLine}</p> : null}
              <p className={`mt-3 ${mutedLabelClass}`}>
                Review issues below. Use Fix with PR on findings Provix can repair safely.
              </p>
            </section>

            {report ? (
              <>
                <SecurityGuardPanel report={report} />
                <FirewallViolationsTable report={report} repoUrl={scannedRepoUrl} />
              </>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
