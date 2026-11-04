import { createClient } from "@/utils/supabase/client";
import {
  buildExactOAuthCallbackUrl,
  rememberOAuthNext,
} from "@/lib/auth-callback-url";

export const EMPLOYER_SIGNUP_COOKIE = "provix_signup_role";

export function rememberEmployerSignupIntent() {
  document.cookie = `${EMPLOYER_SIGNUP_COOKIE}=employer; Path=/; Max-Age=600; SameSite=Lax`;
}

export function clearEmployerSignupIntent() {
  document.cookie = `${EMPLOYER_SIGNUP_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export async function handleGoogleSignIn(nextPath?: string, accountKind?: "employer" | "candidate") {
  const supabase = createClient();
  const destination =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/onboarding";

  // Exact /auth/callback (no query). Supabase only honors allow-listed Redirect
  // URLs; query variants fall back to the Site URL and often lose the session.
  rememberOAuthNext(destination);
  const redirectTo = buildExactOAuthCallbackUrl();

  if (accountKind === "employer") {
    rememberEmployerSignupIntent();
  }

  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
}
