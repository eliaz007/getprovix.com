"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Business account creation moved into the "Business Sign Up" toggle on the
// main login page (src/app/login/page.tsx), backed by real Supabase auth
// instead of the old localStorage mock this page used to write to. This
// stub just forwards old links/bookmarks so nothing 404s.
export default function BusinessOnboardingRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login");
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-sm text-zinc-500">Redirecting...</p>
    </div>
  );
}
