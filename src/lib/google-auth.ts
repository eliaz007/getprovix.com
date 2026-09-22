import { createClient } from "@/utils/supabase/client";

export const EMPLOYER_SIGNUP_COOKIE = "provix_signup_role";

export function rememberEmployerSignupIntent() {
  document.cookie = `${EMPLOYER_SIGNUP_COOKIE}=employer; Path=/; Max-Age=600; SameSite=Lax`;
}

export function clearEmployerSignupIntent() {
  document.cookie = `${EMPLOYER_SIGNUP_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export async function handleGoogleSignIn(nextPath?: string, accountKind?: "employer" | "candidate") {
  const supabase = createClient();
  const origin = window.location.origin;
  const next =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/dashboard";
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  if (accountKind === "employer") {
    rememberEmployerSignupIntent();
  }

  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
}
