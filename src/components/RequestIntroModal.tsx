"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

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
};

type RequestIntroModalProps = {
  open: boolean;
  candidate: IntroRequestCandidate | null;
  onClose: () => void;
  onSuccess: () => void;
};

type FormState = {
  companyName: string;
  workEmail: string;
  roleTitle: string;
  compBand: CompBand | "";
  agreedToTerms: boolean;
};

const INITIAL_FORM: FormState = {
  companyName: "",
  workEmail: "",
  roleTitle: "",
  compBand: "",
  agreedToTerms: false,
};

export default function RequestIntroModal({
  open,
  candidate,
  onClose,
  onSuccess,
}: RequestIntroModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(INITIAL_FORM);
      setSubmitting(false);
      setError(null);
    }
  }, [open, candidate?.id]);

  if (!open || !candidate) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const companyName = form.companyName.trim();
    const workEmail = form.workEmail.trim();
    const roleTitle = form.roleTitle.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!companyName || !workEmail || !roleTitle || !form.compBand) {
      setError("Please complete all required fields.");
      return;
    }

    if (!emailPattern.test(workEmail)) {
      setError("Enter a valid work email address.");
      return;
    }

    if (!form.agreedToTerms) {
      setError("You must agree to the Provix Placement Terms.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("You must be logged in to request an introduction.");
        return;
      }

      const { error: insertError } = await supabase.from("intro_requests").insert({
        user_id: user.id,
        employer_company: companyName,
        employer_email: workEmail,
        candidate_id: candidate.profileId ?? candidate.id,
        role_title: roleTitle,
        comp_band: form.compBand,
        status: "pending",
      });

      if (insertError) {
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
      <div className="bg-[#121212] border border-slate-800 rounded-2xl max-w-md w-full p-6 relative shadow-2xl">
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
            Our team will review your request and coordinate a warm introduction.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
              Company Name
            </label>
            <input
              type="text"
              value={form.companyName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  companyName: event.target.value,
                }))
              }
              required
              className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
              Work Email
            </label>
            <input
              type="email"
              value={form.workEmail}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  workEmail: event.target.value,
                }))
              }
              required
              className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
              Role Title
            </label>
            <input
              type="text"
              value={form.roleTitle}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  roleTitle: event.target.value,
                }))
              }
              placeholder="e.g. Full-Stack Engineer"
              required
              className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase">
              Target Compensation Band
            </label>
            <select
              value={form.compBand}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  compBand: event.target.value as CompBand,
                }))
              }
              required
              className="w-full bg-[#0A0A0A] border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
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

          <label className="flex items-start gap-3 rounded-xl border border-slate-800 bg-[#0A0A0A] p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.agreedToTerms}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  agreedToTerms: event.target.checked,
                }))
              }
              required
              className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs text-slate-300 leading-relaxed">
              I agree to Provix Placement Terms (10% first-year base salary /
              $2,500 minimum fee upon hire).
            </span>
          </label>

          {error && (
            <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-xl text-xs transition-all cursor-pointer disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
