"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function TalentDirectoryPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.replace("/dashboard");
        return;
      }

      router.replace("/login?next=/dashboard");
    });
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-sm text-zinc-500">Loading vetted talent pool...</p>
    </div>
  );
}
