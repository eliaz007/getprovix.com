import Link from "next/link";

export default function AuditorPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-slate-200 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold text-white">GitHub &amp; Resume Auditor</h1>
        <p className="text-sm text-slate-400">
          Deep-audit your GitHub repos and resume for proof-of-work credibility.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex text-sm text-indigo-400 hover:text-indigo-300"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
