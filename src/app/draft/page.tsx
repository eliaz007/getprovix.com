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
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <p className="text-sm text-slate-500">Redirecting...</p>
    </div>
  );
}
