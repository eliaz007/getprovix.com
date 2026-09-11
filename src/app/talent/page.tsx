"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function TalentDirectoryPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (data.user) {
          router.replace("/dashboard");
          return;
        }

        router.replace("/");
      })
      .catch((err) => {
        console.error("Talent redirect failed:", err);
        router.replace("/");
      });
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-sm text-textMuted">Loading vetted talent pool...</p>
    </div>
  );
}
