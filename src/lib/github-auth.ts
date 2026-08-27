import { createClient } from "@/utils/supabase/client";
import { buildOAuthCallbackUrl } from "@/lib/auth-callback-url";

export async function handleGitHubSignIn() {
  const supabase = createClient();

  return supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: buildOAuthCallbackUrl(),
    },
  });
}
