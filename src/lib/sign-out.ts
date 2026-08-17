"use client";

import { createClient } from "@/utils/supabase/client";

export async function signOutAndClearSession(): Promise<void> {
  const supabase = createClient();

  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error("Client sign out failed:", error);
  }

  try {
    const response = await fetch("/api/auth/signout", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      console.error("Server sign out failed:", payload);
    }
  } catch (error) {
    console.error("Server sign out failed:", error);
  }
}
