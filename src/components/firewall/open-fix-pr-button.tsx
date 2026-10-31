"use client";

import { Loader2 } from "lucide-react";
import { rowPrimaryActionClass } from "@/components/firewall/firewall-ui";

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
  className = rowPrimaryActionClass,
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
