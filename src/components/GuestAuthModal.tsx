"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitHubSignInButton } from "@/components/GitHubSignInButton";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { DashboardIcons } from "@/components/dashboard/dashboard-icons";
import Card from "@/components/ui/Card";

export default function GuestAuthModal({
  open,
  error,
  onClose,
  onError,
}: {
  open: boolean;
  error: string | null;
  onClose: () => void;
  onError: (message: string | null) => void;
}) {
  const pathname = usePathname();
  const loginHref =
    pathname && pathname.startsWith("/") && !pathname.startsWith("//")
      ? `/login?next=${encodeURIComponent(pathname)}`
      : "/login";

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close sign in dialog"
        className="absolute inset-0 bg-black/70 cursor-pointer"
        onClick={onClose}
      />
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-auth-title"
        interactive={false}
        className="relative w-full max-w-md p-6"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors duration-200 ease-out cursor-pointer"
          aria-label="Close"
        >
          <DashboardIcons.XMark />
        </button>
        <h2
          id="guest-auth-title"
          className="text-lg font-extrabold tracking-tight text-white pr-8"
        >
          Sign in or create an account
        </h2>
        <p className="text-sm text-zinc-300 mt-2 leading-relaxed">
          You can browse roles freely. Sign in to express interest, apply, and
          use career accelerator tools.
        </p>
        <div className="mt-6 flex w-full flex-col gap-3">
          <GitHubSignInButton onError={(message) => onError(message || null)} />
          <GoogleSignInButton onError={(message) => onError(message || null)} />
        </div>
        {error ? (
          <p className="text-xs text-red-400 mt-3">{error}</p>
        ) : null}
        <p className="text-[11px] text-zinc-400 mt-4 text-center">
          Prefer email?{" "}
          <Link
            href={loginHref}
            className="text-indigo-300 hover:text-indigo-200 font-semibold transition-colors duration-200"
          >
            Sign in / Sign up
          </Link>
        </p>
      </Card>
    </div>
  );
}
