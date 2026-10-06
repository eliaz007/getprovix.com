import { createClient } from "@/utils/supabase/client";
import {
  buildExactOAuthCallbackUrl,
  rememberOAuthNext,
} from "@/lib/auth-callback-url";
import { rememberEmployerSignupIntent } from "@/lib/google-auth";

export async function handleGitHubSignIn(
  nextPath?: string,
  accountKind?: "employer" | "candidate"
) {
  const supabase = createClient();
  const destination =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/dashboard";

  // Exact /auth/callback (no query). Supabase only honors allow-listed Redirect
  // URLs; query variants fall back to the Site URL and often lose the session.
  rememberOAuthNext(destination);
  const redirectTo = buildExactOAuthCallbackUrl();

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
  const destination =
    nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/dashboard";

  rememberOAuthNext(destination);
  const redirectTo = buildExactOAuthCallbackUrl();

  // Requires Authentication → Providers / Auth settings → "Allow manual linking"
  // in the Supabase Dashboard. Without it, GoTrue returns "Manual linking is disabled".
  // No special headers beyond the existing session cookies are required.
  const result = await supabase.auth.linkIdentity({
    provider: "github",
    options: {
      redirectTo,
      scopes: "read:user user:email",
    },
  });

  console.info("DEBUG GITHUB LINK IDENTITY:", {
    provider: "github",
    method: "linkIdentity",
    redirectTo,
    nextPath: destination,
    hasUrl: Boolean(result.data?.url),
    error: result.error
      ? {
          name: result.error.name,
          message: result.error.message,
          status: result.error.status,
          code: (result.error as { code?: string }).code,
        }
      : null,
  });

  if (result.error) {
    console.error("DEBUG GITHUB AUTH ERROR:", {
      error: result.error,
      errorDescription: result.error.message,
      sessionUser: (await supabase.auth.getUser()).data.user,
      method: "linkIdentity",
      redirectTo,
    });
  }

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
