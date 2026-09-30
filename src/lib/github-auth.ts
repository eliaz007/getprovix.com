import { createClient } from "@/utils/supabase/client";
import { buildOAuthCallbackUrl } from "@/lib/auth-callback-url";
import { rememberEmployerSignupIntent } from "@/lib/google-auth";

export async function handleGitHubSignIn(nextPath?: string, accountKind?: "employer" | "candidate") {
  const supabase = createClient();
  const origin = window.location.origin;
  const redirectTo =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
      : buildOAuthCallbackUrl();

  if (accountKind === "employer") {
    rememberEmployerSignupIntent();
  }

  return supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo },
  });
}

export async function handleGitHubLinkIdentity(nextPath = "/dashboard") {
  const supabase = createClient();
  const origin = window.location.origin;
  const destination =
    nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/dashboard";

  // Requires Authentication → Providers / Auth settings → "Allow manual linking"
  // in the Supabase Dashboard. Without it, GoTrue returns "Manual linking is disabled".
  const result = await supabase.auth.linkIdentity({
    provider: "github",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(destination)}`,
      scopes: "read:user user:email",
    },
  });

  if (
    result.error &&
    /manual linking is disabled/i.test(result.error.message)
  ) {
    return {
      ...result,
      error: {
        ...result.error,
        message:
          "GitHub account linking is turned off for this project. Enable “Allow manual linking” in the Supabase Dashboard (Authentication settings), then try again.",
      },
    };
  }

  return result;
}
