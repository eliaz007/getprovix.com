"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useDashboardNav } from "@/components/dashboard/dashboard-nav-context";
import { isEmployerRole } from "@/lib/dashboard-account";
import { isMissingCompanyName } from "@/lib/company-name";
import { createClient } from "@/utils/supabase/client";

const MIN_COMPANY_NAME_LENGTH = 2;

export default function CompanySetupModal() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    isGuest,
    isBusinessAccount,
    accountRole,
    companyName,
    companyNameReady,
    userId,
    setCompanyName,
  } = useDashboardNav();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEmployer = isBusinessAccount || isEmployerRole(accountRole);
  const open =
    !isGuest &&
    isEmployer &&
    companyNameReady &&
    isMissingCompanyName(companyName);

  useEffect(() => {
    if (!open) {
      return;
    }

    setValue("");
    setError(null);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const trimmed = value.trim();
  const canSubmit =
    trimmed.length >= MIN_COMPANY_NAME_LENGTH && !isMissingCompanyName(trimmed);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!userId || saving) {
      return;
    }

    if (!canSubmit) {
      setError("Enter a company name with at least 2 characters.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ company_name: trimmed })
        .eq("id", userId);

      if (updateError) {
        console.error("Company name update failed:", updateError);
        setError("Could not save your company name. Please try again.");
        return;
      }

      setCompanyName(trimmed);
      router.refresh();
    } catch (err) {
      console.error("Company name update failed:", err);
      setError("Could not save your company name. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="company-setup-title"
        aria-describedby="company-setup-copy"
        className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#131316] p-8 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="company-setup-title"
          className="text-2xl font-extrabold tracking-tight text-zinc-100"
        >
          Welcome to Provix
        </h2>
        <p
          id="company-setup-copy"
          className="mt-2 text-sm leading-relaxed text-zinc-400"
        >
          Enter your company name to access candidate audits and talent intros.
        </p>

        <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block">
            <span className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Company Name
            </span>
            <input
              ref={inputRef}
              type="text"
              required
              minLength={MIN_COMPANY_NAME_LENGTH}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              placeholder="Acme Inc."
              autoComplete="organization"
              className="w-full rounded-xl border border-white/[0.08] bg-[#0B0B0D] p-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand focus:outline-none"
            />
          </label>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brandHover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              "Save & Continue"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
