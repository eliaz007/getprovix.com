import Link from "next/link";
import { ProvixLogo } from "@/components/ProvixLogo";

export default function PublicProfileNotFound() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-zinc-50">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex h-16 max-w-4xl items-center px-6">
          <Link href="/" className="hover:opacity-90 transition-opacity duration-200">
            <ProvixLogo />
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col items-start px-6 py-16">
        <h1 className="text-2xl font-extrabold tracking-tight text-white">Profile unavailable</h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-zinc-300">
          This public profile is not available. The candidate may have hidden
          their profile from employers or the link may be outdated.
        </p>
        <Link
          href="/"
          className="mt-6 rounded-md bg-indigo-600 px-4 py-2.5 text-xs font-bold tracking-tight text-white transition-colors duration-200 ease-out hover:bg-indigo-500"
        >
          Back to Provix
        </Link>
      </main>
    </div>
  );
}
