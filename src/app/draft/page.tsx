"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// This route's full talent-pool/profile-studio UI (previously ~1,800 lines,
// gated behind a mock localStorage "auth" overlay) has moved to
// src/app/dashboard/page.tsx, now gated by real Supabase auth instead.
// This stub just forwards old links/bookmarks so nothing 404s.
export default function DraftRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-sm text-textMuted">Redirecting...</p>
    </div>
  );
}
