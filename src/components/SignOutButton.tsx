"use client";

import { useState } from "react";
import { signOutAndClearSession } from "@/lib/sign-out";

interface SignOutButtonProps {
  className?: string;
  redirectTo?: string;
}

const DEFAULT_CLASSES =
  "bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 hover:text-red-300 font-medium text-sm tracking-tight px-4 py-2 rounded-md transition-colors duration-200 ease-out cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

export default function SignOutButton({
  className,
  redirectTo = "/",
}: SignOutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleSignOut = () => {
    setLoading(true);
    window.location.href = redirectTo;
    void signOutAndClearSession();
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className={className ?? DEFAULT_CLASSES}
    >
      {loading ? "Signing out..." : "Sign Out"}
    </button>
  );
}
