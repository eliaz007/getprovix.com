"use client";

import { useState } from "react";
import type { FirewallAutofixPullRequestResponse, FirewallPvimFinding, FirewallReport } from "@/lib/firewall-contract";
import {
  buildPvimAnalysisView,
  buildPvimFindingViews,
  buildPvimFixWithPrRequestBody,
  buildPvimReasoningView,
  shouldRenderPvimPanel,
  type PvimFindingView,
  type PvimReasoningView,
} from "@/lib/pvim/pvim-findings-view";
import { useFirewallView } from "@/components/firewall/firewall-view-context";
import { OpenFixPrButton } from "@/components/firewall/open-fix-pr-button";
import { useGithubRepoWriteAccess } from "@/components/firewall/use-github-repo-write-access";
import Toast from "@/components/Toast";
import { prOpenedToast, useToast } from "@/components/use-toast";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  FilePathPill,
  StatusPill,
  findingListClass,
  findingRowClass,
  mutedLabelClass,
  panelClass,
  sectionLabelClass,
  statusPillClass,
} from "@/components/firewall/firewall-ui";

function FindingSnippet({ snippet }: { snippet: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        {open ? "Hide evidence" : "Inspect evidence"}
      </button>
      {/* Keep snippet in the DOM (hidden when collapsed) so SSR/static markup still React-escapes untrusted text. */}
      <pre
        hidden={!open}
        className="mt-2 max-h-48 overflow-auto rounded-lg border border-white/[0.06] bg-black/50 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-400"
      >
        <code>{snippet}</code>
      </pre>
    </div>
  );
}

type PullState =
  | { status: "idle" }
  | { status: "opening" }
  | { status: "opened"; url: string; number: number }
  | { status: "error"; message: string };

/**
 * Explicit user-initiated Fix-with-PR for a supported PVIM finding.
 * Never auto-opens; mounts only when the view model already gated eligibility.
 */
export function PvimFixWithPrAction({
  finding,
  commitSha,
  onOpened,
  className,
}: {
  finding: FirewallPvimFinding;
  commitSha: string;
  onOpened?: (pull: { url: string; number: number }) => void;
  className?: string;
}) {
  const { repoSlug } = useFirewallView();
  const writeAccess = useGithubRepoWriteAccess(repoSlug);
  const { showToast, toast } = useToast();
  const [pull, setPull] = useState<PullState>({ status: "idle" });

  async function openFixPr() {
    if (pull.status === "opening" || pull.status === "opened") return;
    if (!repoSlug) {
      setPull({
        status: "error",
        message: "Scan a GitHub repository before opening a pull request.",
      });
      return;
    }
    if (!writeAccess.canOpenPullRequest) {
      setPull({
        status: "error",
        message:
          writeAccess.accessMessage ??
          "Provix GitHub App is not installed on this repository. Install the app, then try Fix with PR again.",
      });
      return;
    }

    const body = buildPvimFixWithPrRequestBody(finding, { repoSlug, commitSha });
    if (!body) {
      setPull({
        status: "error",
        message: "This PVIM finding is not eligible for Fix with PR.",
      });
      return;
    }

    setPull({ status: "opening" });
    try {
      const response = await fetch("/api/firewall/autofix/pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await readJsonResponse<FirewallAutofixPullRequestResponse>(response);
      const message = payload.message ?? "The pull request could not be opened.";
      if (!response.ok || !payload.ok || !payload.url || typeof payload.number !== "number") {
        setPull({ status: "error", message });
        return;
      }
      const opened = { url: payload.url, number: payload.number };
      setPull({ status: "opened", ...opened });
      if (onOpened) {
        onOpened(opened);
      } else {
        showToast(prOpenedToast(opened));
      }
    } catch (error) {
      setPull({
        status: "error",
        message: error instanceof Error ? error.message : "The pull request could not be opened.",
      });
    }
  }

  return (
    <div className={`flex flex-wrap items-center justify-end gap-1 ${className ?? ""}`}>
      {pull.status === "opened" ? (
        <a
          href={pull.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/15"
        >
          PR #{pull.number}
        </a>
      ) : (
        <OpenFixPrButton
          opening={pull.status === "opening"}
          onClick={() => void openFixPr()}
        />
      )}
      {pull.status === "error" ? (
        <p className="w-full text-right text-xs text-red-300/90" role="alert">
          {pull.message}
        </p>
      ) : null}
      {toast ? <Toast {...toast} /> : null}
    </div>
  );
}

function FindingRow({
  finding,
  source,
  commitSha,
}: {
  finding: PvimFindingView;
  source: FirewallPvimFinding;
  commitSha: string | null;
}) {
  return (
    <li className={findingRowClass}>
      <div className="min-w-0 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={finding.label} tone="warn" />
          <span
            className={`inline-flex rounded-md px-2 py-0.5 font-mono text-[11px] font-medium ${statusPillClass("neutral")}`}
            title={finding.ruleId}
          >
            {finding.ruleId}
          </span>
          {finding.confidence ? (
            <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${statusPillClass("neutral")}`}>
              {finding.confidence}
            </span>
          ) : null}
          {finding.family ? (
            <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${statusPillClass("info")}`}>
              family {finding.family}
            </span>
          ) : null}
          {finding.filePath ? (
            <FilePathPill path={finding.filePath} line={finding.line ?? undefined} />
          ) : (
            <span className={mutedLabelClass}>No file location</span>
          )}
        </div>

        {finding.message ? (
          <p className="text-sm leading-relaxed text-zinc-400">{finding.message}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            label={finding.remediation.label}
            tone={finding.remediation.tone}
          />
          {finding.offerFixWithPr && commitSha ? (
            <PvimFixWithPrAction finding={source} commitSha={commitSha} />
          ) : (
            <span className={mutedLabelClass}>Not offered as Fix with PR</span>
          )}
        </div>
        {finding.remediation.explanation ? (
          <p className="text-xs leading-relaxed text-zinc-500">{finding.remediation.explanation}</p>
        ) : null}

        {finding.snippet ? <FindingSnippet snippet={finding.snippet} /> : null}
      </div>
    </li>
  );
}

function PvimReasoningSubsection({ reasoning }: { reasoning: PvimReasoningView }) {
  if (!reasoning.visible) return null;

  return (
    <div className={panelClass} aria-label="Advisory reasoning (non-authoritative)">
      <div className="border-b border-white/[0.06] px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className={sectionLabelClass}>Advisory reasoning (non-authoritative)</h2>
          <StatusPill label={reasoning.statusLabel} tone={reasoning.statusTone} />
        </div>
        <p className={`mt-1 ${mutedLabelClass}`}>{reasoning.disclaimer}</p>
      </div>

      <div className="space-y-3 px-5 py-4">
        {reasoning.detail ? (
          <p className="text-sm leading-relaxed text-zinc-400">{reasoning.detail}</p>
        ) : null}

        {reasoning.needsHumanReview ? (
          <p className="text-xs text-amber-200/90" role="status">
            Human review recommended
            {reasoning.criticalFlags.length > 0
              ? ` · ${reasoning.criticalFlags.join(" · ")}`
              : ""}
            .
          </p>
        ) : null}

        {reasoning.showsAdvisoryBody ? (
          <div className="space-y-4">
            {reasoning.notes ? (
              <div>
                <p className={mutedLabelClass}>Notes</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-300">{reasoning.notes}</p>
              </div>
            ) : null}

            {reasoning.openQuestions.length > 0 ? (
              <div>
                <p className={mutedLabelClass}>Open questions</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
                  {reasoning.openQuestions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {reasoning.answerBlurbs.length > 0 ? (
              <div>
                <p className={mutedLabelClass}>Investigation answers</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
                  {reasoning.answerBlurbs.map((blurb) => (
                    <li key={blurb}>{blurb}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * PVIM shadow-analysis panel.
 * Separate from Provix Security findings; never merges into score/runner UI.
 * Fix with PR is user-initiated and only for adapter-supported findings with a pinned SHA.
 */
export default function PvimFindingsPanel({ report }: { report: FirewallReport }) {
  if (!shouldRenderPvimPanel(report)) return null;

  const analysis = buildPvimAnalysisView(report.pvim, report.pvimFindings);
  if (!analysis.visible) return null;

  const findings = buildPvimFindingViews(report.pvimFindings, report);
  const reasoning = buildPvimReasoningView(report.pvimReasoning);
  const commitSha =
    typeof report.commitSha === "string" && report.commitSha.trim() ? report.commitSha.trim() : null;
  const sources = report.pvimFindings ?? [];

  return (
    <section className="space-y-4" aria-label="PVIM shadow analysis">
      <div className={panelClass}>
        <div className="border-b border-white/[0.06] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={sectionLabelClass}>PVIM shadow analysis</h2>
            <StatusPill label={analysis.statusLabel} tone={analysis.statusTone} />
          </div>
          <p className={`mt-1 ${mutedLabelClass}`}>
            Separate analysis engine — not part of Provix scoring. Fix with PR is manual for supported findings only.
          </p>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4">
          <div className="border-b border-white/[0.06] px-5 py-4 sm:border-b-0 sm:border-r">
            <dt className={mutedLabelClass}>Status</dt>
            <dd className="mt-2 text-sm text-zinc-200">{analysis.statusLabel}</dd>
          </div>
          <div className="border-b border-white/[0.06] px-5 py-4 sm:border-b-0 sm:border-r">
            <dt className={mutedLabelClass}>Findings</dt>
            <dd className="mt-2 text-2xl font-medium tabular-nums tracking-tight text-zinc-50">
              {analysis.findingCount}
            </dd>
          </div>
          <div className="border-b border-white/[0.06] px-5 py-4 sm:border-b-0 sm:border-r">
            <dt className={mutedLabelClass}>Duration</dt>
            <dd className="mt-2 text-sm tabular-nums text-zinc-200">
              {analysis.elapsedLabel ?? "—"}
            </dd>
          </div>
          <div className="px-5 py-4">
            <dt className={mutedLabelClass}>Engine</dt>
            <dd className="mt-2 font-mono text-sm text-zinc-200">
              {analysis.engineVersion ?? "—"}
            </dd>
          </div>
        </dl>

        <div className="border-t border-white/[0.06] px-5 py-4 space-y-2">
          <p className="text-sm text-zinc-300">{analysis.headline}</p>
          {analysis.detail ? (
            <p className="text-sm leading-relaxed text-zinc-500">{analysis.detail}</p>
          ) : null}
          {analysis.incompleteCount > 0 || analysis.status === "incomplete" ? (
            <p className="text-xs text-amber-200/90" role="status">
              Incomplete analysis
              {analysis.incompleteCount > 0
                ? ` · ${analysis.incompleteCount} incomplete signal${analysis.incompleteCount === 1 ? "" : "s"}`
                : ""}
              . Do not treat this as a clean PVIM scan.
            </p>
          ) : null}
        </div>
      </div>

      <PvimReasoningSubsection reasoning={reasoning} />

      {analysis.showsFindingsList ? (
        <div className={panelClass}>
          <div className="border-b border-white/[0.06] px-5 py-4">
            <h2 className={sectionLabelClass}>PVIM findings</h2>
            <p className={`mt-1 ${mutedLabelClass}`}>
              Labels and rules from PVIM only.{" "}
              <span className="tabular-nums text-zinc-300">{findings.length}</span> listed
            </p>
          </div>

          {findings.length === 0 ? (
            <p className="flex items-center gap-2 px-5 py-10 text-sm text-zinc-500">
              {analysis.status === "ok" ? <StatusPill label="Clear" tone="ok" /> : null}
              {analysis.emptyFindingsMessage ?? "No PVIM findings listed."}
            </p>
          ) : (
            <ul className={findingListClass}>
              {findings.map((finding, index) => (
                <FindingRow
                  key={finding.key}
                  finding={finding}
                  source={sources[index]!}
                  commitSha={commitSha}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
