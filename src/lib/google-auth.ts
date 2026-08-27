import { createClient } from "@/utils/supabase/client";
import { buildOAuthCallbackUrl } from "@/lib/auth-callback-url";

export async function handleGoogleSignIn() {
  const supabase = createClient();

  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: buildOAuthCallbackUrl(),
    },
  });
}
