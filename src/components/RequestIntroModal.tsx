"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { readJsonResponse } from "@/lib/read-json-response";
import { getCorporateWorkEmailValidationMessage } from "@/lib/corporate-email";
import { normalizeContractHourlyRate } from "@/lib/contract-availability";
import { PUBLIC_PLACEMENT_TERMS_SUMMARY } from "@/lib/placement-terms";
import {
  CONTRACT_INTRO_COMMITMENT_OPTIONS,
  CONTRACT_INTRO_DURATION_OPTIONS,
  formatContractIntroCompensationRange,
  type ContractIntroCommitment,
  type ContractIntroDuration,
  type IntroHireType,
} from "@/lib/intro-hire-type";

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
  contractHourlyRate?: number | null;
};

type RequestIntroModalProps = {
  open: boolean;
  candidate: IntroRequestCandidate | null;
  defaultRoleTitle?: string;
  /** Defaults to full-time so existing call sites stay unchanged. */
  hireType?: IntroHireType;
  onClose: () => void;
  onSuccess: () => void;
};

export default function RequestIntroModal({
  open,
  candidate,
  defaultRoleTitle = "",
  hireType = "fulltime",
  onClose,
  onSuccess,
}: RequestIntroModalProps) {
  const isContract = hireType === "contract";

  const [companyName, setCompanyName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [compBand, setCompBand] = useState<CompBand | "">("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [commitment, setCommitment] = useState<ContractIntroCommitment | "">(
    ""
  );
  const [duration, setDuration] = useState<ContractIntroDuration | "">("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCompanyName("");
      setWorkEmail("");
      setRoleTitle("");
      setCompBand("");
      setHourlyRate("");
      setCommitment("");
      setDuration("");
      setTermsAccepted(false);
      setSubmitting(false);
      setError(null);
      return;
    }

    setRoleTitle(defaultRoleTitle.trim());
    const prefRate = normalizeContractHourlyRate(candidate?.contractHourlyRate);
    setHourlyRate(prefRate != null ? String(prefRate) : "");
    setCommitment("");
    setDuration("");
    setCompBand("");
  }, [open, candidate?.id, candidate?.contractHourlyRate, defaultRoleTitle]);

  if (!open || !candidate) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedCompanyName = companyName.trim();
    const trimmedWorkEmail = workEmail.trim();
    const trimmedRoleTitle = roleTitle.trim();

    if (!trimmedCompanyName || !trimmedWorkEmail || !trimmedRoleTitle) {
      setError("Please complete all required fields.");
      return;
    }

    let compensationRange = "";
    let parsedHourly: number | null = null;

    if (isContract) {
      parsedHourly = normalizeContractHourlyRate(hourlyRate);
      if (
        parsedHourly == null ||
        parsedHourly <= 0 ||
        !commitment ||
        !duration
      ) {
        setError("Please complete hourly rate, commitment, and duration.");
        return;
      }
      compensationRange = formatContractIntroCompensationRange({
        hourlyRate: parsedHourly,
        commitment,
        duration,
      });
    } else {
      if (!compBand) {
        setError("Please complete all required fields.");
        return;
      }
      compensationRange = compBand;
    }

    const workEmailError = getCorporateWorkEmailValidationMessage(trimmedWorkEmail);
    if (workEmailError) {
      setError(workEmailError);
      return;
    }

    if (!termsAccepted) {
      setError(
        isContract
          ? "You must agree to the Provix Contract Terms."
          : "You must agree to the Provix Terms of Service & Placement Policy."
      );
      return;
    }

    const candidateId = candidate.profileId?.trim() || "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId)) {
      setError("This candidate profile is missing a valid ID. Refresh and try again.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetchWithAuth("/api/intros/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          candidateName: candidate.name || "Candidate",
          companyName: trimmedCompanyName,
          companyEmail: trimmedWorkEmail,
          targetRole: trimmedRoleTitle,
          compensationRange,
          hireType: isContract ? "contract" : "fulltime",
          ...(isContract && parsedHourly != null
            ? {
                contractHourlyRate: parsedHourly,
                estimatedCommitment: commitment,
                estimatedDuration: duration,
              }
            : {}),
          termsAccepted: true,
        }),
      });

      const payload = (await readJsonResponse(response).catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setError(payload?.error ?? "Could not submit your request. Please try again.");
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
      <Card interactive={false} className="max-w-md w-full p-6 relative">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="absolute top-4 right-4 text-textMuted hover:text-textMain transition-colors cursor-pointer disabled:opacity-50"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-5 pr-8">
          {isContract ? (
            <>
              <h3 className="text-lg font-bold text-textMain">
                Request Contract Introduction to {candidate.name}
              </h3>
              <p className="text-sm text-textMuted mt-1">
                Direct contract introductions with verified technical proof.
                Connect directly to align on scope, milestones, and hourly
                engagement.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-bold text-textMain">
                Request Warm Introduction to {candidate.name}
              </h3>
              <p className="text-sm text-textMuted mt-1">
                No upfront fees. Provix only earns when you hire:{" "}
                {PUBLIC_PLACEMENT_TERMS_SUMMARY}
              </p>
            </>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase">
              Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              required
              className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain placeholder:text-textMuted focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase">
              Work Email
            </label>
            <input
              type="email"
              value={workEmail}
              onChange={(event) => setWorkEmail(event.target.value)}
              required
              className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain placeholder:text-textMuted focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase">
              Role Title
            </label>
            <input
              type="text"
              value={roleTitle}
              onChange={(event) => setRoleTitle(event.target.value)}
              placeholder={
                isContract
                  ? "e.g. Contract Full-Stack Engineer"
                  : "e.g. Full-Stack Engineer"
              }
              required
              className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain placeholder:text-textMuted focus:outline-none focus:border-brand"
            />
          </div>

          {isContract ? (
            <>
              <div>
                <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase">
                  Target Hourly Rate ($/hr)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={hourlyRate}
                  onChange={(event) => setHourlyRate(event.target.value)}
                  placeholder="e.g. 85"
                  required
                  className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain placeholder:text-textMuted focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase">
                  Estimated Commitment
                </label>
                <select
                  value={commitment}
                  onChange={(event) =>
                    setCommitment(
                      event.target.value as ContractIntroCommitment | ""
                    )
                  }
                  required
                  className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain focus:outline-none focus:border-brand"
                >
                  <option value="" disabled>
                    Select weekly commitment
                  </option>
                  {CONTRACT_INTRO_COMMITMENT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase">
                  Estimated Duration
                </label>
                <select
                  value={duration}
                  onChange={(event) =>
                    setDuration(event.target.value as ContractIntroDuration | "")
                  }
                  required
                  className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain focus:outline-none focus:border-brand"
                >
                  <option value="" disabled>
                    Select engagement duration
                  </option>
                  {CONTRACT_INTRO_DURATION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-[11px] font-bold text-textMuted mb-2 uppercase">
                Target Compensation Band
              </label>
              <select
                value={compBand}
                onChange={(event) => setCompBand(event.target.value as CompBand)}
                required
                className="w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain focus:outline-none focus:border-brand"
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
          )}

          {isContract ? (
            <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(event) => setTermsAccepted(event.target.checked)}
                required
                className="mt-0.5 h-4 w-4 rounded border-border bg-background text-brand focus:ring-brand"
              />
              <span className="text-xs text-textMuted leading-relaxed">
                I agree to{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  className="text-brand hover:text-brand underline underline-offset-2"
                >
                  Provix Contract Terms
                </Link>
                . Direct contract introductions require independent engagement
                terms between company and contractor.
              </span>
            </label>
          ) : (
            <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(event) => setTermsAccepted(event.target.checked)}
                required
                className="mt-0.5 h-4 w-4 rounded border-border bg-background text-brand focus:ring-brand"
              />
              <span className="text-xs text-textMuted leading-relaxed">
                I agree to the{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  className="text-brand hover:text-brand underline underline-offset-2"
                >
                  Provix Placement Terms
                </Link>
                : {PUBLIC_PLACEMENT_TERMS_SUMMARY} Employers remain responsible
                for independent pre-hire verification.
              </span>
            </label>
          )}

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
