"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

export const COMP_BAND_OPTIONS = [
  "$60k–$80k",
  "$80k–$110k",
  "$110k–$140k",
  "$140k+",
  "Contract / Hourly",
] as const;

export type CompBand = (typeof COMP_BAND_OPTIONS)[number];

export type IntroRequestCandidate = {
  id: string;
  profileId?: string | null;
  name: string;
  full_name?: string;
  fullName?: string;
};

type RequestIntroModalProps = {
  open: boolean;
  candidate: IntroRequestCandidate | null;
  defaultRoleTitle?: string;
  onClose: () => void;
  onSuccess: () => void;
};

export default function RequestIntroModal({
  open,
  candidate,
  defaultRoleTitle = "",
  onClose,
  onSuccess,
}: RequestIntroModalProps) {
  const [companyName, setCompanyName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [compBand, setCompBand] = useState<CompBand | "">("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCompanyName("");
      setWorkEmail("");
      setRoleTitle("");
      setCompBand("");
      setTermsAccepted(false);
      setSubmitting(false);
      setError(null);
      return;
    }

    setRoleTitle(defaultRoleTitle.trim());
  }, [open, candidate?.id, defaultRoleTitle]);

  if (!open || !candidate) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedCompanyName = companyName.trim();
    const trimmedWorkEmail = workEmail.trim();
    const trimmedRoleTitle = roleTitle.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!trimmedCompanyName || !trimmedWorkEmail || !trimmedRoleTitle || !compBand) {
      setError("Please complete all required fields.");
      return;
    }

    if (!emailPattern.test(trimmedWorkEmail)) {
      setError("Enter a valid work email address.");
      return;
    }

    if (!termsAccepted) {
      setError(
        "You must agree to the Provix Terms of Service & Placement Policy."
      );
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/intros/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.profileId ?? candidate.id,
          candidateName: candidate.name || "Candidate",
          companyName: trimmedCompanyName,
          companyEmail: trimmedWorkEmail,
          targetRole: trimmedRoleTitle,
          compensationRange: compBand,
          termsAccepted: true,
        }),
      });

      if (!response.ok) {
        setError("Could not submit your request. Please try again.");
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError("Could not submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <Card className="max-w-md w-full p-6 relative">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-5 pr-8">
          <h3 className="text-lg font-bold text-white">
            Request Warm Introduction to {candidate.name}
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            No upfront fees. Provix only earns when you hire through our
            contingency placement model.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
              Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              required
              className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
              Work Email
            </label>
            <input
              type="email"
              value={workEmail}
              onChange={(event) => setWorkEmail(event.target.value)}
              required
              className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
              Role Title
            </label>
            <input
              type="text"
              value={roleTitle}
              onChange={(event) => setRoleTitle(event.target.value)}
              placeholder="e.g. Full-Stack Engineer"
              required
              className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
              Target Compensation Band
            </label>
            <select
              value={compBand}
              onChange={(event) => setCompBand(event.target.value as CompBand)}
              required
              className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="" disabled>
                Select compensation band
              </option>
              {COMP_BAND_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-[#0A0A0A] p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
              required
              className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs text-slate-300 leading-relaxed">
              I agree to the{" "}
              <Link
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
              >
                Provix Placement Terms
              </Link>
              : 10% of first-year salary upon hire, or a $2,500 flat fee for
              roles under $25,000. Employers remain responsible for independent
              pre-hire verification.
            </span>
          </label>

          {error && (
            <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !termsAccepted}
              className="flex-1 text-xs"
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
