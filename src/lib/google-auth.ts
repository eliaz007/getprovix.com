import { createClient } from "@/utils/supabase/client";

export async function handleGoogleSignIn() {
  const supabase = createClient();

  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${location.origin}/auth/callback`,
    },
  });
}
