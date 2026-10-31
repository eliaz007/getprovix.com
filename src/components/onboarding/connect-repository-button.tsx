"use client";

import { useState } from "react";

/** Full GitHub + AST onboarding (split-screen login, App install, first audit). */
const ONBOARDING_PATH = "/onboarding";

/**
 * Hard-navigate into onboarding.
 * Soft client transitions can leave Next's RSC debug channel open; a late write
 * then throws "Cannot write to a CLOSED writable stream" and freezes the overlay.
 */
export default function ConnectRepositoryButton({ label = "Connect Repository" }: { label?: string }) {
  const [pending, setPending] = useState(false);

  function connect() {
    if (pending) return;
    setPending(true);
    try {
      window.location.assign(ONBOARDING_PATH);
    } catch {
      setPending(false);
      window.location.href = ONBOARDING_PATH;
    }
  }

  return (
    <button
      type="button"
      onClick={connect}
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg bg-zinc-100 px-4 py-2.5 font-mono text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "Connecting…" : label}
    </button>
  );
}
