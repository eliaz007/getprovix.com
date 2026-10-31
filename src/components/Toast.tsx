"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

export type ToastVariant = "success" | "error";

export type ToastLink = {
  href: string;
  label: string;
};

const ERROR_TOAST_PATTERN =
  /required|could not|couldn'?t|failed|must be|try again|invalid|denied|unable|missing/i;

export function inferToastVariant(message: string): ToastVariant {
  return ERROR_TOAST_PATTERN.test(message) ? "error" : "success";
}

type ToastProps = {
  message: string | null;
  variant?: ToastVariant;
  className?: string;
  link?: ToastLink | null;
  /** When set, the toast auto-dismisses after this many ms. */
  durationMs?: number;
  onDismiss?: () => void;
};

export default function Toast({
  message,
  variant,
  className = "bottom-6 right-6",
  link = null,
  durationMs,
  onDismiss,
}: ToastProps) {
  const [phase, setPhase] = useState<"idle" | "in" | "out">("idle");
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!message) {
      setPhase("idle");
      return;
    }

    setPhase("in");
    if (durationMs == null || durationMs <= 0) {
      return;
    }

    const hideAt = window.setTimeout(() => setPhase("out"), durationMs);
    const removeAt = window.setTimeout(() => {
      dismissRef.current?.();
    }, durationMs + 220);

    return () => {
      window.clearTimeout(hideAt);
      window.clearTimeout(removeAt);
    };
  }, [message, link?.href, link?.label, durationMs]);

  if (!message) return null;

  const resolvedVariant = variant ?? inferToastVariant(message);
  const isError = resolvedVariant === "error";

  return (
    <div
      className={`toast-slide fixed z-50 flex max-w-[min(24rem,calc(100vw-2rem))] items-center gap-3 rounded-xl border bg-panel px-4 py-3 text-xs font-medium text-textMain print:hidden ${
        isError ? "border-red-500/40" : "border-emerald-500/25"
      } ${phase === "out" ? "toast-slide-out" : "toast-slide-in"} ${className}`}
      role={isError ? "alert" : "status"}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          isError
            ? "bg-red-500/15 text-red-400"
            : "bg-emerald-500/15 text-emerald-400"
        }`}
      >
        {isError ? (
          <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
        ) : (
          <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
        )}
      </span>
      <span className="min-w-0 leading-snug">
        {message}
        {link ? (
          <>
            {" "}
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-emerald-300 underline decoration-emerald-500/40 underline-offset-2 transition-colors hover:text-emerald-200 hover:decoration-emerald-300"
            >
              {link.label}
            </a>
          </>
        ) : null}
      </span>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={() => {
            setPhase("out");
            window.setTimeout(() => dismissRef.current?.(), 180);
          }}
          className="ml-0.5 shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
        >
          <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
