"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

export default function CopyShareLinkButton({
  url,
  label,
  copiedLabel = "Link copied",
}: {
  /** Omit to copy the current page URL. */
  url?: string;
  label: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const onCopy = async () => {
    const target =
      url ?? (typeof window !== "undefined" ? window.location.href : "");
    if (!target) {
      setFailed(true);
      return;
    }

    try {
      await navigator.clipboard.writeText(target);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setFailed(true);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition-colors hover:bg-zinc-900"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
      ) : (
        <Link2 className="h-3.5 w-3.5" aria-hidden />
      )}
      {failed ? "Could not copy link" : copied ? copiedLabel : label}
    </button>
  );
}
