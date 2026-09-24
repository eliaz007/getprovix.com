"use client";

import { Check, X } from "lucide-react";

export type ToastVariant = "success" | "error";

const ERROR_TOAST_PATTERN =
  /required|could not|couldn'?t|failed|must be|try again|invalid|denied|unable|missing/i;

export function inferToastVariant(message: string): ToastVariant {
  return ERROR_TOAST_PATTERN.test(message) ? "error" : "success";
}

type ToastProps = {
  message: string | null;
  variant?: ToastVariant;
  className?: string;
};

export default function Toast({
  message,
  variant,
  className = "bottom-6 right-6",
}: ToastProps) {
  if (!message) return null;

  const resolvedVariant = variant ?? inferToastVariant(message);
  const isError = resolvedVariant === "error";

  return (
    <div
      className={`fixed z-50 bg-panel text-textMain text-xs font-medium px-4 py-3 rounded-xl flex items-center gap-3 border ${
        isError ? "border-red-500/40" : "border-border"
      } ${className}`}
      role={isError ? "alert" : "status"}
    >
      <span
        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
          isError
            ? "bg-red-500/15 text-red-400"
            : "bg-emerald-500/15 text-emerald-400"
        }`}
      >
        {isError ? (
          <X className="w-3 h-3" strokeWidth={2.5} aria-hidden />
        ) : (
          <Check className="w-3 h-3" strokeWidth={2.5} aria-hidden />
        )}
      </span>
      <span>{message}</span>
    </div>
  );
}
