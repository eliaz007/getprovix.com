import { createClient } from "@/utils/supabase/client";
import { buildOAuthCallbackUrl } from "@/lib/auth-callback-url";

export async function handleGitHubSignIn(nextPath?: string) {
  const supabase = createClient();
  const origin = window.location.origin;
  const redirectTo =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
      : buildOAuthCallbackUrl();

  return supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo,
    },
  });
}
