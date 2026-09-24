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
  description,
  loginHref: loginHrefProp,
  nextPath,
}: {
  open: boolean;
  error: string | null;
  onClose: () => void;
  onError: (message: string | null) => void;
  description?: string;
  loginHref?: string;
  nextPath?: string;
}) {
  const pathname = usePathname();
  const resolvedNext =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : pathname && pathname.startsWith("/") && !pathname.startsWith("//")
        ? pathname
        : "/dashboard";
  const loginHref =
    loginHrefProp ?? `/login?next=${encodeURIComponent(resolvedNext)}`;

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
          className="absolute top-4 right-4 text-textMuted hover:text-textMain transition-colors duration-200 ease-out cursor-pointer"
          aria-label="Close"
        >
          <DashboardIcons.XMark />
        </button>
        <h2
          id="guest-auth-title"
          className="text-lg font-extrabold tracking-tight text-textMain pr-8"
        >
          Sign in or create an account
        </h2>
        <p className="text-sm text-textMuted mt-2 leading-relaxed">
          {description ??
            "You can browse roles freely. Sign in to express interest, apply, and use career accelerator tools."}
        </p>
        <div className="mt-6 flex w-full flex-col gap-3">
          <GitHubSignInButton
            nextPath={resolvedNext}
            onError={(message) => onError(message || null)}
          />
          <GoogleSignInButton
            nextPath={resolvedNext}
            onError={(message) => onError(message || null)}
          />
        </div>
        {error ? (
          <p className="text-xs text-red-400 mt-3">{error}</p>
        ) : null}
        <p className="text-[11px] text-textMuted mt-4 text-center">
          Prefer email?{" "}
          <Link
            href={loginHref}
            className="text-brand hover:text-brand font-semibold transition-colors duration-200"
          >
            Sign in / Sign up
          </Link>
        </p>
      </Card>
    </div>
  );
}
