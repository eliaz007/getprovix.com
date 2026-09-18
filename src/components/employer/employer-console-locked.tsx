import { Lock } from "lucide-react";

export default function EmployerConsoleLockedCard() {
  return (
    <div className="max-w-md mx-auto mt-16 p-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 text-center flex flex-col items-center shadow-xl">
      <div className="p-3 rounded-full bg-zinc-800 text-zinc-400 mb-4">
        <Lock className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">
        Employer Console Locked
      </h2>
      <p className="text-sm text-zinc-400 leading-relaxed mb-6">
        To protect candidate privacy and maintain talent quality, browsing
        candidates and managing job listings requires a verified company email
        address.
      </p>
      <p className="text-xs text-zinc-500 bg-zinc-950/60 py-2 px-4 rounded-lg border border-zinc-800/80">
        Check your work inbox for the confirmation link sent from the banner
        above.
      </p>
    </div>
  );
}
