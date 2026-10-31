"use client";

import { useCallback, useState } from "react";
import type { ToastLink, ToastVariant } from "@/components/Toast";

export type ShowToastInput = {
  message: string;
  variant?: ToastVariant;
  link?: ToastLink | null;
  durationMs?: number;
};

export type ToastState = {
  message: string | null;
  variant?: ToastVariant;
  link?: ToastLink | null;
  durationMs?: number;
  onDismiss: () => void;
};

const DEFAULT_DURATION_MS = 4200;

export function useToast(defaultDurationMs = DEFAULT_DURATION_MS) {
  const [message, setMessage] = useState<string | null>(null);
  const [variant, setVariant] = useState<ToastVariant | undefined>(undefined);
  const [link, setLink] = useState<ToastLink | null>(null);
  const [durationMs, setDurationMs] = useState(defaultDurationMs);

  const dismissToast = useCallback(() => {
    setMessage(null);
    setLink(null);
    setVariant(undefined);
  }, []);

  const showToast = useCallback(
    (input: string | ShowToastInput) => {
      if (typeof input === "string") {
        setMessage(input);
        setVariant(undefined);
        setLink(null);
        setDurationMs(defaultDurationMs);
        return;
      }
      setMessage(input.message);
      setVariant(input.variant);
      setLink(input.link ?? null);
      setDurationMs(input.durationMs ?? defaultDurationMs);
    },
    [defaultDurationMs]
  );

  const toast: ToastState = {
    message,
    variant,
    link,
    durationMs,
    onDismiss: dismissToast,
  };

  return { showToast, dismissToast, toast };
}

/** Success copy for the autofix “Open Fix PR” flow. */
export function prOpenedToast(pull: { number: number; url: string }): ShowToastInput {
  return {
    message: `PR #${pull.number} opened successfully`,
    variant: "success",
    link: {
      href: pull.url,
      label: `View PR #${pull.number} ↗`,
    },
    durationMs: 5200,
  };
}
