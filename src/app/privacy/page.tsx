import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Provix",
  description:
    "How Provix collects, uses, and protects your data across verification, matching, and hiring workflows.",
};

const sections = [
  {
    title: "Information We Collect",
    paragraphs: [
      "When you create an account or complete onboarding, Provix collects account information through Supabase authentication and profile fields you provide — such as your name, email, role, experience level, skills, portfolio links, and employer or candidate profile details.",
      "For candidates, Provix may process GitHub and proof-of-work metrics when you submit repositories or portfolio URLs for screening. This can include repository metadata, commit activity samples, language signals, README excerpts, and derived technical indicators used to generate integrity and execution scores.",
      "We also collect usage data when you interact with the platform, including pages visited, feature usage (such as talent pool browsing, deep screening requests, and job matching), device and browser type, and standard server logs generated during normal operation.",
    ],
  },
  {
    title: "How We Use Information",
    paragraphs: [
      "Provix uses collected information to operate the platform and deliver its core services: generating verification and integrity scores, producing employer interview cheat sheets, matching candidates to open roles, and displaying relevant talent pool results.",
      "Profile and screening data help employers evaluate proof-of-work signals before outreach, while candidate data helps personalize job recommendations, application workflows, and visibility settings within the talent pool.",
      "We may use aggregated or de-identified usage data to improve product performance, reliability, and user experience. We do not sell personal information.",
    ],
  },
  {
    title: "Third-Party Infrastructure",
    paragraphs: [
      "Provix relies on trusted infrastructure and service providers to run the product:",
      "Supabase — authentication, database storage, and row-level security for profile and application data.",
      "Vercel — application hosting, edge delivery, and deployment infrastructure.",
      "Google Gemini AI — AI-assisted screening, matching, essay review, college fit analysis, and related structured outputs sent through our API routes.",
      "GitHub API — repository metadata and public code signals used during proof-of-work and deep screening workflows when candidates or employers provide GitHub URLs.",
      "These providers process data only as needed to deliver their services to Provix and are subject to their own privacy and security practices.",
    ],
  },
  {
    title: "Data Security & Retention",
    paragraphs: [
      "Provix applies industry-standard safeguards to protect your information, including encrypted transport (HTTPS/TLS), access controls, and Supabase Row Level Security (RLS) policies that restrict profile access to authorized users and permitted application flows.",
      "Authentication credentials are managed by Supabase Auth; Provix does not store raw passwords in application code.",
      "We retain account and profile data for as long as your account remains active or as needed to provide services, comply with legal obligations, resolve disputes, and enforce our agreements. You may request deletion of your account data subject to applicable law and operational requirements.",
    ],
  },
  {
    title: "User Rights & Contact",
    paragraphs: [
      "Depending on your location, you may have rights to access, correct, export, or delete personal information we hold about you, or to object to certain processing activities.",
      "To exercise these rights or ask questions about this policy, contact us at support@provix.app. We will respond within a reasonable timeframe.",
      "We may update this Privacy Policy from time to time. Material changes will be reflected on this page with an updated effective date.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          ← Back to Home
        </Link>

        <header className="mt-8 mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-3">
            Legal
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Privacy Policy
          </h1>
          <p className="mt-4 text-sm text-zinc-400 leading-relaxed">
            Effective date: August 16, 2026. This policy describes how Provix
            collects, uses, and protects information when you use our verified
            candidate intelligence platform.
          </p>
        </header>

        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-bold text-white mb-3">
                {section.title}
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-zinc-300">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 pt-8 border-t border-zinc-800 text-sm text-zinc-500">
          Questions? Email{" "}
          <a
            href="mailto:support@getprovix.com"
            className="text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            support@provix.app
          </a>
          .
        </footer>
      </div>
    </div>
  );
}
