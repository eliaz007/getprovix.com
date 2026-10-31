"use client";

import { Loader2 } from "lucide-react";

const primaryButton =
  "inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-950 transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-70";

type OpenFixPrButtonProps = {
  opening: boolean;
  onClick: () => void;
  className?: string;
  idleLabel?: string;
  openingLabel?: string;
};

/** Shared single-click PR trigger with a brief in-button loading state. */
export function OpenFixPrButton({
  opening,
  onClick,
  className = primaryButton,
  idleLabel = "Open Fix PR",
  openingLabel = "Opening…",
}: OpenFixPrButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={opening}
      aria-busy={opening}
      className={className}
    >
      {opening ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden />
          <span>{openingLabel}</span>
        </>
      ) : (
        idleLabel
      )}
    </button>
  );
}
