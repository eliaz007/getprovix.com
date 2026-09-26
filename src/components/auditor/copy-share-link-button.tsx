"use client";

import { useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";

export default function CopyShareLinkButton({
  url,
  path,
  label,
  copiedLabel = "Link copied",
  prominent = false,
}: {
  /** Full URL. Ignored when `path` is set. */
  url?: string;
  /** App path copied as `${window.location.origin}${path}`. */
  path?: string;
  label: string;
  copiedLabel?: string;
  /** Accent button for the executive verdict, not a metadata chip. */
  prominent?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const onCopy = async () => {
    if (typeof window === "undefined") {
      setFailed(true);
      return;
    }

    const target = path
      ? `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`
      : (url ?? window.location.href);
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
      className={
        prominent
          ? "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand/70 bg-brand/20 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:border-brand hover:bg-brand/40"
          : "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition-colors hover:bg-zinc-900"
      }
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
      ) : prominent ? (
        <Share2 className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Link2 className="h-3.5 w-3.5" aria-hidden />
      )}
      {failed ? "Could not copy link" : copied ? copiedLabel : label}
    </button>
  );
}
