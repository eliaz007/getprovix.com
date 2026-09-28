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
  // Exact path, no query string. Supabase Auth only honors redirectTo when it
  // matches an allow-listed Redirect URL; otherwise it falls back to the Site
  // URL and the browser lands on /?code= with no session. The callback route
  // sends a successful OAuth exchange to /dashboard.
  const redirectTo = `${window.location.origin}/auth/callback`;

  if (accountKind === "employer") {
    rememberEmployerSignupIntent();
  }

  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
}
