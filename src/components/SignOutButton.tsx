"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

interface SignOutButtonProps {
  className?: string;
  redirectTo?: string;
}

const DEFAULT_CLASSES =
  "bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 font-medium text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

export default function SignOutButton({
  className,
  redirectTo = "/login",
}: SignOutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);

    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Sign out failed:", error);
    }

    window.location.href = redirectTo;
  };

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      disabled={loading}
      className={className ?? DEFAULT_CLASSES}
    >
      {loading ? "Signing out..." : "Sign Out"}
    </button>
  );
}
