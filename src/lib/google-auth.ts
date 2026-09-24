import { createClient } from "@/utils/supabase/client";

export const EMPLOYER_SIGNUP_COOKIE = "provix_signup_role";

export function rememberEmployerSignupIntent() {
  document.cookie = `${EMPLOYER_SIGNUP_COOKIE}=employer; Path=/; Max-Age=600; SameSite=Lax`;
}

export function clearEmployerSignupIntent() {
  document.cookie = `${EMPLOYER_SIGNUP_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export async function handleGoogleSignIn(_nextPath?: string, accountKind?: "employer" | "candidate") {
  const supabase = createClient();
  const redirectTo = `${window.location.origin}/auth/callback?next=/dashboard`;

  if (accountKind === "employer") {
    rememberEmployerSignupIntent();
  }

  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
}
