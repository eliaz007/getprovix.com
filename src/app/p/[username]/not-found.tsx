import Link from "next/link";
import { ProvixLogo } from "@/components/ProvixLogo";

export default function PublicProfileNotFound() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-slate-200">
      <header className="border-b border-slate-800/80">
        <div className="mx-auto flex h-16 max-w-4xl items-center px-6">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <ProvixLogo />
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col items-start px-6 py-16">
        <h1 className="text-2xl font-bold text-white">Profile unavailable</h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-400">
          This public profile is not available. The candidate may have hidden
          their profile from employers or the link may be outdated.
        </p>
        <Link
          href="/"
          className="mt-6 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-indigo-500"
        >
          Back to Provix
        </Link>
      </main>
    </div>
  );
}
