"use client";

import { useState } from "react";
import { ExternalLink, FileDown, Loader2, ShieldCheck } from "lucide-react";
import type { AuditResult } from "@/app/api/audit/route";
import AuditResultsPanel from "@/components/auditor/audit-results-panel";
import Button from "@/components/ui/Button";
import FormLabel from "@/components/ui/FormLabel";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  hasUsableGitHubAuditTarget,
  parseGitHubRepoPath,
} from "@/lib/validate-github-url";

type AdminAuditResponse = AuditResult & {
  error?: string;
  shareId?: string | null;
  reportUrl?: string | null;
  pdfUrl?: string | null;
  profileUrl?: string | null;
  profileSlug?: string | null;
  adminAudit?: boolean;
};

const GLASS_CARD =
  "rounded-xl border border-white/[0.08] bg-[#131316]/90 p-6 shadow-2xl backdrop-blur-xl";
const TERMINAL_INPUT =
  "w-full rounded-lg border border-white/[0.09] bg-[#070709] px-3.5 py-2.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-all focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20";

export default function AdminUnlimitedAuditor() {
  const [githubUrl, setGithubUrl] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateHandle, setCandidateHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdminAuditResponse | null>(null);

  const parsed = parseGitHubRepoPath(githubUrl.trim());
  const repoLabel =
    parsed?.owner && parsed.repo
      ? `${parsed.owner}/${parsed.repo}`
      : null;

  const runAdminAudit = async () => {
    const trimmed = githubUrl.trim();
    if (loading) {
      return;
    }
    if (!hasUsableGitHubAuditTarget(trimmed)) {
      setError("Enter a valid public GitHub repository URL.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubUrl: trimmed,
          compensationLevel: "Mid",
          adminAudit: true,
          candidateName: candidateName.trim() || undefined,
          candidateHandle: candidateHandle.trim() || undefined,
        }),
      });

      const data = (await readJsonResponse(response)) as AdminAuditResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Admin audit failed.");
      }

      if (typeof data.score !== "number") {
        throw new Error("Audit response was incomplete.");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin audit failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className={`${GLASS_CARD} space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-amber-300">
              Unlimited admin pipeline
            </p>
            <h2 className="mt-1 text-lg font-bold text-zinc-50">
              Run full audit → persist share → profile → PDF
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">
              Bypasses daily scan limits, ownership gates, and credit
              decrementing. Persists a shared audit report and updates a matching
              candidate profile when handle or GitHub owner resolves.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-200">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Admin only
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormLabel htmlFor="admin-audit-github-url">
              GitHub repository URL
            </FormLabel>
            <input
              id="admin-audit-github-url"
              type="url"
              inputMode="url"
              spellCheck={false}
              value={githubUrl}
              onChange={(event) => setGithubUrl(event.target.value)}
              placeholder="https://github.com/owner/repo"
              className={TERMINAL_INPUT}
            />
          </div>
          <div>
            <FormLabel htmlFor="admin-audit-candidate-name">
              Candidate name (optional)
            </FormLabel>
            <input
              id="admin-audit-candidate-name"
              type="text"
              value={candidateName}
              onChange={(event) => setCandidateName(event.target.value)}
              placeholder="Alex Rivera"
              className={TERMINAL_INPUT}
            />
          </div>
          <div>
            <FormLabel htmlFor="admin-audit-candidate-handle">
              Profile handle / slug (optional)
            </FormLabel>
            <input
              id="admin-audit-candidate-handle"
              type="text"
              value={candidateHandle}
              onChange={(event) => setCandidateHandle(event.target.value)}
              placeholder="alex-rivera"
              className={TERMINAL_INPUT}
            />
          </div>
        </div>

        <Button
          type="button"
          onClick={() => void runAdminAudit()}
          disabled={loading}
          className="inline-flex items-center gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ShieldCheck className="h-4 w-4" aria-hidden />
          )}
          {loading ? "Running unlimited audit..." : "Run unlimited audit"}
        </Button>

        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        ) : null}
      </div>

      {result ? (
        <div className="space-y-4">
          <div className={`${GLASS_CARD} space-y-3`}>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-emerald-300">
              Output links
            </p>
            <ul className="space-y-2">
              <li>
                <LinkRow
                  label="Public profile"
                  href={result.profileUrl}
                  emptyHint="No matching profile slug/GitHub username found. Share report still saved."
                />
              </li>
              <li>
                <LinkRow
                  label="Audit report"
                  href={result.reportUrl}
                  emptyHint="Share insert failed. Re-run the audit."
                />
              </li>
              <li>
                <LinkRow
                  label="PDF download"
                  href={result.pdfUrl}
                  emptyHint="Open the audit report, then use Export Dossier (PDF)."
                  icon="pdf"
                />
              </li>
            </ul>
            <p className="text-xs leading-relaxed text-zinc-500">
              Score {result.score}/100
              {repoLabel ? ` · ${repoLabel}` : ""}. PDF opens the shared report
              with print dialog (browser Save as PDF).
            </p>
          </div>

          <AuditResultsPanel
            result={result}
            repoName={repoLabel ?? undefined}
            repoUrl={githubUrl.trim() || undefined}
            shareId={result.shareId ?? null}
            readOnly
          />
        </div>
      ) : null}
    </div>
  );
}

function LinkRow({
  label,
  href,
  emptyHint,
  icon = "link",
}: {
  label: string;
  href?: string | null;
  emptyHint: string;
  icon?: "link" | "pdf";
}) {
  if (!href) {
    return (
      <div className="rounded-lg border border-white/[0.08] bg-[#070709] px-3 py-2.5">
        <p className="text-xs font-semibold text-zinc-400">{label}</p>
        <p className="mt-0.5 text-sm text-zinc-500">{emptyHint}</p>
      </div>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-200 transition-colors hover:bg-emerald-500/15"
    >
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-wide text-emerald-300/80">
          {label}
        </span>
        <span className="mt-0.5 block truncate font-mono text-xs text-emerald-100">
          {href}
        </span>
      </span>
      {icon === "pdf" ? (
        <FileDown className="h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
      )}
    </a>
  );
}
