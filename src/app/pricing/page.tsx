"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

type FeatureHighlight = {
  title: string;
  description: string;
  icon: typeof ShieldCheck;
};

const employerHighlights: FeatureHighlight[] = [
  {
    title: "Zero Upfront Subscription",
    description:
      "Free account, unlimited profile browsing, and instant AI screening reports.",
    icon: Sparkles,
  },
  {
    title: "Contract / Hourly Hires",
    description:
      "Transparent, low-margin hourly rates with built-in contractor management.",
    icon: Clock3,
  },
  {
    title: "Full-Time Placements",
    description:
      "12% success fee only when you officially hire, backed by a 60-day replacement guarantee.",
    icon: ShieldCheck,
  },
];

const talentHighlights = [
  "List your profile in the vetted talent pool",
  "Get AI match scores against live roles",
  "Share proof-of-work and portfolio links",
  "Apply to opportunities with one click",
];

const BETA_ACCESS_STORAGE_KEY = "vanguardx_beta_access_unlocked";

export default function PricingPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUnlockBetaAccess = async () => {
    const trimmedCompany = companyName.trim();
    const trimmedEmail = workEmail.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!trimmedCompany || !trimmedEmail) {
      setErrorMessage("Enter your company name and work email.");
      return;
    }

    if (!emailPattern.test(trimmedEmail)) {
      setErrorMessage("Enter a valid work email address.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const markBetaUnlocked = () => {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(BETA_ACCESS_STORAGE_KEY, "true");
      }
    };

    try {
      const response = await fetch("/api/beta-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: trimmedCompany,
          work_email: trimmedEmail,
        }),
      });

      if (response.status === 401) {
        router.push("/login?next=/dashboard");
        return;
      }

      const data = (await response.json()) as {
        error?: string;
        success?: boolean;
        warnings?: string[];
      };

      if (response.status === 400) {
        setErrorMessage(data.error ?? "Enter a valid work email address.");
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Could not unlock beta access.");
      }

      markBetaUnlocked();
      setSuccessMessage(
        "Beta access active! Deep screening unlocked. Redirecting to your dashboard…"
      );
      window.setTimeout(() => router.push("/dashboard"), 1200);
    } catch (err) {
      console.error("Pricing beta unlock failed:", err);
      markBetaUnlocked();
      setSuccessMessage(
        "Beta access active for this session. Redirecting to your dashboard…"
      );
      window.setTimeout(() => router.push("/dashboard"), 1200);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center py-16 px-4">
      <div className="w-full max-w-5xl mx-auto space-y-16">
        <section className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-indigo-300 mb-6">
            <Sparkles className="w-3.5 h-3.5" aria-hidden />
            Performance-Based Hiring
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            Hire Vetted Talent with Zero Upfront Cost
          </h1>
          <p className="text-zinc-400 text-base sm:text-lg mt-4 max-w-3xl mx-auto leading-relaxed">
            Browse profiles, view proof-of-work, and generate Gemini Deep
            Screenings for free during our beta.
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {employerHighlights.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-600/15 border border-indigo-500/25 text-indigo-400 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5" aria-hidden />
                </div>
                <h2 className="text-base font-bold text-white">{item.title}</h2>
                <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                  {item.description}
                </p>
              </div>
            );
          })}
        </section>

        <section className="bg-zinc-900 border border-indigo-500/30 rounded-2xl p-8 shadow-2xl max-w-xl mx-auto w-full">
          <h2 className="text-xl font-bold text-white text-center">
            Unlock Early Beta Access
          </h2>
          <p className="text-sm text-zinc-400 text-center mt-2 leading-relaxed">
            Tell us where you hire from and we&apos;ll enable deep screening,
            profile browsing, and candidate contact tools instantly.
          </p>

          <div className="mt-6 space-y-3">
            <div>
              <label
                htmlFor="pricing-company-name"
                className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5"
              >
                Company Name
              </label>
              <input
                id="pricing-company-name"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Talent Partners"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>
            <div>
              <label
                htmlFor="pricing-work-email"
                className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5"
              >
                Work Email
              </label>
              <input
                id="pricing-work-email"
                type="email"
                value={workEmail}
                onChange={(e) => {
                  setWorkEmail(e.target.value);
                  if (errorMessage) {
                    setErrorMessage(null);
                  }
                }}
                placeholder="hiring@company.com"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>
          </div>

          {errorMessage && (
            <p className="text-sm text-red-400 mt-4 text-center">{errorMessage}</p>
          )}
          {successMessage && (
            <p className="text-sm text-emerald-400 mt-4 text-center">
              {successMessage}
            </p>
          )}

          <button
            type="button"
            onClick={handleUnlockBetaAccess}
            disabled={submitting}
            className="w-full mt-6 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition-all shadow-lg shadow-indigo-500/20 cursor-pointer"
          >
            {submitting ? "Unlocking..." : "Unlock Early Beta Access"}
          </button>
        </section>

        <div className="flex items-center gap-4">
          <div className="flex-1 border-t border-zinc-800" />
          <span className="text-xs text-zinc-500 uppercase tracking-widest font-medium">
            For Talent &amp; Students
          </span>
          <div className="flex-1 border-t border-zinc-800" />
        </div>

        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-3xl mx-auto w-full">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">
                Always Free for Candidates
              </h2>
              <p className="text-zinc-400 text-sm mt-2 leading-relaxed">
                Build a verified profile, get matched to roles, and showcase
                proof-of-work at no cost.
              </p>
              <ul className="mt-5 space-y-3">
                {talentHighlights.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 text-sm text-zinc-300"
                  >
                    <CheckCircle2
                      className="w-4 h-4 shrink-0 text-emerald-400"
                      aria-hidden
                    />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="mt-6 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-semibold py-3 px-5 rounded-lg text-sm transition-all cursor-pointer"
              >
                Create Candidate Profile
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
