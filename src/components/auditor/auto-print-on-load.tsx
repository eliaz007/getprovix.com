"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * When `?print=1` is present, opens the browser print dialog so admins can
 * Save as PDF from the shared audit dossier (existing print stylesheet).
 */
export default function AutoPrintOnLoad() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("print") !== "1") {
      return;
    }

    const timer = window.setTimeout(() => {
      window.print();
    }, 400);

    return () => window.clearTimeout(timer);
  }, [searchParams]);

  return null;
}
