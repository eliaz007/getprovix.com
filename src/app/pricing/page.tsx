"use client";

import { useRouter } from "next/navigation";

function CheckIcon() {
  return (
    <svg className="w-4 h-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-4 h-4 shrink-0 text-red-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

type CardVariant = "default" | "indigo" | "gold";

type PricingCard = {
  name: string;
  price: string;
  cadence: string;
  badge?: string;
  variant?: CardVariant;
  pros: string[];
  cons?: string[];
};

const employerPlans: PricingCard[] = [
  {
    name: "Monthly",
    price: "$299",
    cadence: "/ mo",
    variant: "default",
    pros: [
      "Unlimited talent searches",
      "Raw AI execution scores",
      "Deep-dive code access",
      "Zero placement fees",
    ],
  },
  {
    name: "Annual",
    price: "$2,990",
    cadence: "/ yr",
    badge: "Save 17%",
    variant: "indigo",
    pros: [
      "Unlimited talent searches",
      "Raw AI execution scores",
      "Deep-dive code access",
      "Zero placement fees",
    ],
  },
];

const talentPlans: PricingCard[] = [
  {
    name: "Base Tier",
    price: "$0",
    cadence: "/ mo",
    variant: "default",
    pros: ["List profile in talent pool", "Standard AI score"],
    cons: ["No detailed AI feedback", "No priority placement", "No profile analytics"],
  },
  {
    name: "Vanguard Pro",
    price: "$15",
    cadence: "/ mo",
    badge: "Most Popular",
    variant: "gold",
    pros: [
      "Full AI code review & feedback",
      "Priority placement (Verified Badge)",
      "See which agencies view your profile",
    ],
  },
];

const variantStyles: Record<CardVariant, { border: string; badge: string; button: string }> = {
  default: {
    border: "border-zinc-800",
    badge: "bg-zinc-800 text-zinc-300 border border-zinc-700",
    button: "bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white",
  },
  indigo: {
    border: "border-indigo-500/50",
    badge: "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30",
    button: "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20",
  },
  gold: {
    border: "border-amber-400/40",
    badge: "bg-amber-500/90 text-zinc-950 shadow-lg shadow-amber-500/30",
    button: "bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-lg shadow-amber-500/20",
  },
};

function PricingCardItem({ plan, onGetStarted }: { plan: PricingCard; onGetStarted: () => void }) {
  const styles = variantStyles[plan.variant ?? "default"];

  return (
    <div className={`relative bg-zinc-900 border rounded-2xl p-8 shadow-2xl flex flex-col ${styles.border}`}>
      {plan.badge && (
        <span className={`absolute -top-3 right-8 text-xs font-bold px-3 py-1 rounded-full ${styles.badge}`}>
          {plan.badge}
        </span>
      )}

      <h3 className="text-lg font-semibold text-white tracking-tight">{plan.name}</h3>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-extrabold text-white tracking-tight">{plan.price}</span>
        <span className="text-base font-medium text-zinc-400">{plan.cadence}</span>
      </div>

      <ul className="mt-8 flex flex-col gap-3 flex-1">
        {plan.pros.map((feature) => (
          <li key={feature} className="flex items-center gap-3 text-sm text-zinc-300">
            <CheckIcon />
            {feature}
          </li>
        ))}
        {plan.cons?.map((limitation) => (
          <li key={limitation} className="flex items-center gap-3 text-sm text-zinc-500">
            <XIcon />
            {limitation}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onGetStarted}
        className={`w-full font-semibold py-3.5 rounded-lg text-sm transition-all mt-8 ${styles.button}`}
      >
        Get Started
      </button>
    </div>
  );
}

export default function PricingPage() {
  const router = useRouter();
  const goToLogin = () => router.push("/login");

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center py-16 px-4">
      <div className="w-full max-w-6xl mx-auto">
        {/* --- FOR AGENCIES & EMPLOYERS --- */}
        <section>
          <div className="text-center mb-14">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-cyan-300 to-indigo-400 bg-clip-text text-transparent">
              For Agencies &amp; Employers
            </h1>
            <p className="text-zinc-400 text-base sm:text-lg mt-4">
              Hire top-tier, AI-vetted talent with zero placement fees.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {employerPlans.map((plan) => (
              <PricingCardItem key={plan.name} plan={plan} onGetStarted={goToLogin} />
            ))}
          </div>
        </section>

        {/* --- DIVIDER --- */}
        <div className="flex items-center gap-4 my-20">
          <div className="flex-1 border-t border-zinc-800" />
          <span className="text-xs text-zinc-500 uppercase tracking-widest font-medium">
            Two Sides, One Platform
          </span>
          <div className="flex-1 border-t border-zinc-800" />
        </div>

        {/* --- FOR TALENT & STUDENTS --- */}
        <section>
          <div className="text-center mb-14">
            <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
              For Talent &amp; Students
            </h2>
            <p className="text-zinc-400 text-base sm:text-lg mt-4">
              Build a verified profile that gets you discovered and hired.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {talentPlans.map((plan) => (
              <PricingCardItem key={plan.name} plan={plan} onGetStarted={goToLogin} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
