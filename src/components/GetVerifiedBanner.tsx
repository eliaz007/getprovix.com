"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import Button from "@/components/ui/Button";
import { getCorporateWorkEmailValidationMessage } from "@/lib/corporate-email";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { createClient } from "@/utils/supabase/client";

export default function GetVerifiedBanner({
  userId,
  defaultEmail = "",
  onEmailSent,
}: {
  userId: string | null;
  defaultEmail?: string;
  onEmailSent?: (email: string) => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmail(defaultEmail);
  }, [defaultEmail]);

  useEffect(() => {
    if (defaultEmail.trim() || !userId) {
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    void supabase
      .from("profiles")
      .select("contact_email, email")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) {
          return;
        }
        const loaded =
          (typeof data.contact_email === "string" && data.contact_email.trim()) ||
          (typeof data.email === "string" && data.email.trim()) ||
          "";
        if (loaded) {
          setEmail((current) => current.trim() || loaded);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [defaultEmail, userId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const validationError = getCorporateWorkEmailValidationMessage(email);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSending(true);

    try {
      const response = await fetchWithAuth("/api/employer/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        email?: string;
      } | null;

      if (!response.ok) {
        setError(payload?.error ?? "Could not send the confirmation email.");
        return;
      }

      const deliveredTo = payload?.email ?? email.trim();
      setSentTo(deliveredTo);
      onEmailSent?.(deliveredTo);
    } catch {
      setError("Could not send the confirmation email. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-100">Get Verified</p>
          <p className="mt-1 text-sm text-amber-200/90">
            Confirm a corporate work email to unlock the talent pool, AI screening, and job posting.
            Personal inboxes like Gmail are not accepted.
          </p>

          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <label htmlFor="employer-verify-email" className="sr-only">
              Work email
            </label>
            <input
              id="employer-verify-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) {
                  setError(null);
                }
                if (sentTo) {
                  setSentTo(null);
                }
              }}
              placeholder="you@company.com"
              className="w-full sm:flex-1 bg-background border border-amber-500/20 rounded-lg px-3 py-2 text-sm text-textMain placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-amber-400/70"
            />
            <Button type="submit" disabled={sending} className="sm:w-auto w-full">
              {sending ? "Sending..." : "Send confirmation link"}
            </Button>
          </form>

          {error ? (
            <p className="mt-2 text-sm text-red-300">{error}</p>
          ) : sentTo ? (
            <p className="mt-2 text-sm text-emerald-300">
              Check {sentTo} for a confirmation link. It expires in 24 hours.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
