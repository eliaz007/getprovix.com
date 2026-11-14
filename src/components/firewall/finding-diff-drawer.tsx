"use client";

import type { ReactNode } from "react";
import { OpenFixPrButton } from "@/components/firewall/open-fix-pr-button";
import { rowPrimaryActionClass } from "@/components/firewall/firewall-ui";

export function diffLineClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
    return "bg-zinc-950/80 text-zinc-500";
  }
  if (line.startsWith("+")) {
    return "border-l-2 border-emerald-500 bg-emerald-500/10 text-emerald-200";
  }
  if (line.startsWith("-")) {
    return "border-l-2 border-rose-500 bg-rose-500/10 text-rose-200";
  }
  return "text-zinc-400";
}

export function filesTouchedFromDiff(diff: string, fallback: string): string[] {
  const files: string[] = [];
  for (const line of diff.split("\n")) {
    const match = /^\+\+\+ b\/(.+)$/.exec(line);
    const path = match?.[1];
    if (path && path !== "/dev/null" && !files.includes(path)) files.push(path);
  }
  return files.length > 0 ? files : [fallback];
}

/** Subtle dismiss control for open finding rows. */
export const rowDismissActionClass =
  "inline-flex items-center rounded-md px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-900/50 hover:text-zinc-400";

type FindingDiffDrawerProps = {
  diff: string;
  title?: string;
  summary?: string | null;
  footerNote?: string | null;
  ship?: {
    opening: boolean;
    onShip: () => void;
    disabled?: boolean;
  } | null;
  openedPr?: { url: string; number: number } | null;
  extraActions?: ReactNode;
};

/**
 * Inline GitHub-style red/green hunk drawer with an optional primary Ship PR CTA.
 */
export function FindingDiffDrawer({
  diff,
  title,
  summary,
  footerNote,
  ship,
  openedPr,
  extraActions,
}: FindingDiffDrawerProps) {
  const lines = diff.split("\n");

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800/80 bg-[#09090b]">
      {(title || summary) && (
        <div className="border-b border-zinc-800/80 bg-black/50 px-3 py-2">
          {title ? (
            <p className="font-mono text-[11px] text-zinc-400">{title}</p>
          ) : null}
          {summary ? (
            <p className={`text-xs text-zinc-500 ${title ? "mt-1" : ""}`}>{summary}</p>
          ) : null}
        </div>
      )}
      <pre className="max-h-72 overflow-auto font-mono text-[11px] leading-5">
        {lines.map((line, index) => (
          <div
            key={`${index}-${line.slice(0, 48)}`}
            className={`px-3 whitespace-pre ${diffLineClass(line)}`}
          >
            {line.length > 0 ? line : " "}
          </div>
        ))}
      </pre>
      {footerNote ? (
        <p className="border-t border-zinc-800/80 px-3 py-2 font-mono text-[11px] text-zinc-500">
          {footerNote}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/80 bg-zinc-950/80 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">{extraActions}</div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {openedPr ? (
            <a
              href={openedPr.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15"
            >
              PR #{openedPr.number}
            </a>
          ) : ship ? (
            <OpenFixPrButton
              opening={ship.opening}
              onClick={ship.onShip}
              idleLabel="Ship PR"
              openingLabel="Shipping…"
              className={`${rowPrimaryActionClass} opacity-100 ${
                ship.disabled ? "pointer-events-none opacity-50" : ""
              }`}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
