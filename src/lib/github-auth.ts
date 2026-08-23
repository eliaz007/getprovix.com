import { createClient } from "@/utils/supabase/client";

export async function handleGitHubSignIn() {
  const supabase = createClient();

  return supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${location.origin}/auth/callback`,
    },
  });
}
