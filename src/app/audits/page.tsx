import type { Metadata } from "next";
import Link from "next/link";
import GitHubResumeAuditor from "@/components/auditor/github-resume-auditor";
import { ProvixLogo } from "@/components/ProvixLogo";

export const metadata: Metadata = {
  title: "GitHub & Resume Auditor — Provix",
  description:
    "Run a public GitHub and resume credibility audit without signing in.",
};

export default function PublicAuditsPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-slate-200 font-sans antialiased">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-6 py-3 bg-[#111111] border-b border-slate-800/60">
        <Link href="/" className="hover:opacity-90 transition-opacity">
          <ProvixLogo />
        </Link>
        <Link
          href="/login"
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all cursor-pointer"
        >
          Sign In
        </Link>
      </header>
      <main className="p-4 sm:p-6 md:p-12">
        <GitHubResumeAuditor />
      </main>
    </div>
  );
}
