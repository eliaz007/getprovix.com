"use client";

import { useState, type ReactNode } from "react";
import { useFirewallView } from "@/components/firewall/firewall-view-context";
import {
  FindingDiffDrawer,
  filesTouchedFromDiff,
  rowDismissActionClass,
} from "@/components/firewall/finding-diff-drawer";
import { useGithubRepoWriteAccess } from "@/components/firewall/use-github-repo-write-access";
import Toast from "@/components/Toast";
import { prOpenedToast, useToast } from "@/components/use-toast";
import {
  isSecurityCategory,
  type FirewallAutofixPullRequestResponse,
  type FirewallCategory,
  type FirewallRemediation,
} from "@/lib/firewall-contract";
import { isExpectedAutofixRefuse, isTestSourcePath } from "@/lib/firewall-autofix";
import { readJsonResponse } from "@/lib/read-json-response";
import { rowGhostActionClass } from "@/components/firewall/firewall-ui";

type PullState =
  | { status: "idle" }
  | { status: "opening" }
  | { status: "opened"; url: string; number: number }
  | { status: "fallback"; message: string }
  | { status: "error"; message: string };

function lacksWriteAccess(status: number, message: string): boolean {
  if (status === 401 || status === 403) return true;
  return /GITHUB_TOKEN|GitHub App|cannot create a branch|permission|not installed/i.test(message);
}

/** Old server builds returned these as Open Fix failures — never show them as red banners. */
function isSpuriousAutofixNoise(message: string): boolean {
  return (
    /in-memory TypeScript check/i.test(message) ||
    /Cannot find global type/i.test(message) ||
    /error TS2318/i.test(message) ||
    /error TS6053/i.test(message) ||
    /lib\.dom\.d\.ts' not found/i.test(message) ||
    /Cannot find name 'console'/i.test(message) ||
    /Cannot find name 'Promise'/i.test(message) ||
    /Do you need to change your target library/i.test(message) ||
    /Try changing the 'lib' compiler option/i.test(message) ||
    isExpectedAutofixRefuse(message)
  );
}

export function RemediationDiff({
  remediation,
  target,
  children,
  onOpened,
  onDismissed,
  offerFix = true,
}: {
  remediation: FirewallRemediation;
  target?: { filePath: string; line: number; category: FirewallCategory; snippet?: string };
  children?: (parts: {
    toolbar: ReactNode;
    notice: ReactNode;
    diff: ReactNode;
    prOpen: boolean;
  }) => ReactNode;
  onOpened?: (pull: { url: string; number: number }) => void;
  /** User dismiss or expected refuse — parent should drop the finding from the Open queue. */
  onDismissed?: () => void;
  /** False for manual-review rows: show the finding, never the Ship PR button. */
  offerFix?: boolean;
}) {
  const { repoSlug } = useFirewallView();
  const writeAccess = useGithubRepoWriteAccess(repoSlug);
  const { showToast, toast } = useToast();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pull, setPull] = useState<PullState>({ status: "idle" });
  const eligibleFinding = Boolean(
    target &&
      isSecurityCategory(target.category) &&
      !isTestSourcePath(target.filePath)
  );
  const touched = filesTouchedFromDiff(remediation.diff, target?.filePath ?? "patch");
  const canShip = Boolean(eligibleFinding && offerFix);

  async function copyPatch() {
    try {
      await navigator.clipboard.writeText(remediation.diff);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      setCopied(false);
      return false;
    }
  }

  async function openFixPr() {
    if (!target || !canShip || pull.status === "opening" || pull.status === "opened") return;
    if (!repoSlug) {
      await copyPatch();
      setPull({
        status: "fallback",
        message: "Scan a GitHub repository before opening a pull request. The patch was copied to your clipboard.",
      });
      return;
    }
    if (!writeAccess.canOpenPullRequest) {
      await copyPatch();
      setPull({
        status: "fallback",
        message: `${writeAccess.accessMessage ?? "Provix GitHub App is not installed on this repository."} The patch was copied to your clipboard.`,
      });
      return;
    }

    setPull({ status: "opening" });
    try {
      const response = await fetch("/api/firewall/autofix/pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "security",
          repoUrl: repoSlug,
          filePath: target.filePath,
          line: target.line,
          category: target.category,
          ...(target.snippet ? { snippet: target.snippet } : {}),
        }),
      });
      const payload = await readJsonResponse<FirewallAutofixPullRequestResponse>(response);
      const message = payload.message ?? "The pull request could not be opened.";
      if (lacksWriteAccess(response.status, message)) {
        const didCopy = await copyPatch();
        setPull({
          status: "fallback",
          message: didCopy
            ? `${message} The patch was copied to your clipboard.`
            : `${message} Copy Patch is still available.`,
        });
        return;
      }
      if (!response.ok || !payload.ok || !payload.url || typeof payload.number !== "number") {
        if (isSpuriousAutofixNoise(message) || isExpectedAutofixRefuse(message)) {
          setPull({ status: "idle" });
          onDismissed?.();
          return;
        }
        setPull({ status: "error", message });
        return;
      }
      const opened = { url: payload.url, number: payload.number };
      setPull({ status: "opened", ...opened });
      // Prefer parent toast (Security panel mirrors Structure). Fallback if standalone.
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

  const toolbar = (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <div className="inline-flex items-center overflow-hidden rounded-md border border-white/[0.08] bg-black/30">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className={`${rowGhostActionClass} rounded-none border-r border-white/[0.08]`}
          title="Preview the proposed fix without opening a pull request"
        >
          {open ? "Hide" : "Preview fix"}
        </button>
        <button
          type="button"
          onClick={() => void copyPatch()}
          className={`${rowGhostActionClass} rounded-none ${copied ? "text-emerald-300" : ""}`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {pull.status === "opened" ? (
        <a
          href={pull.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15"
        >
          PR #{pull.number}
        </a>
      ) : onDismissed && pull.status !== "opening" ? (
        <button
          type="button"
          onClick={() => onDismissed()}
          className={rowDismissActionClass}
          title="Dismiss this finding from the Open queue"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );

  const notice =
    pull.status === "fallback" ? (
      <p className="rounded-md border border-amber-400/25 bg-amber-400/10 px-2.5 py-1.5 font-mono text-[11px] text-amber-100" role="status">
        {pull.message}
      </p>
    ) : pull.status === "error" ? (
      <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 font-mono text-[11px] text-red-200" role="alert">
        {pull.message}
      </p>
    ) : null;

  const diff = open ? (
    <FindingDiffDrawer
      diff={remediation.diff}
      title={touched.join(" + ")}
      footerNote={
        remediation.command
          ? remediation.command
          : remediation.envExample
            ? `.env.example · ${remediation.envExample}`
            : null
      }
      ship={
        canShip && pull.status !== "opened"
          ? {
              opening: pull.status === "opening" || writeAccess.loading,
              onShip: () => void openFixPr(),
            }
          : null
      }
      openedPr={
        pull.status === "opened" ? { url: pull.url, number: pull.number } : null
      }
      extraActions={
        <button
          type="button"
          onClick={() => void copyPatch()}
          className={`${rowGhostActionClass} ${copied ? "text-emerald-300" : ""}`}
        >
          {copied ? "Copied" : "Copy patch"}
        </button>
      }
    />
  ) : null;

  const toastNode = <Toast {...toast} />;

  if (children) {
    return (
      <>
        {children({ toolbar, notice, diff, prOpen: pull.status === "opened" })}
        {toastNode}
      </>
    );
  }

  return (
    <div className="space-y-2">
      {toolbar}
      {notice}
      {diff}
      {toastNode}
    </div>
  );
}
