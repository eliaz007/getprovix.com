"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function EmployerPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-sm text-textMuted">Loading employer console...</p>
    </div>
  );
}
