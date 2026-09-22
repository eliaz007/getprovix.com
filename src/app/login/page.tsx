"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { OAuthSignInButtons } from "@/components/OAuthSignInButtons";
import { ProvixLogo } from "@/components/ProvixLogo";
import { getPostLoginPath } from "@/lib/admin-access";
import {
  isEmployerSignup,
  loadProfileAccountKind,
  resolvePostAuthDestination,
  signupRoleFromSearch,
} from "@/lib/account-role";
import {
  CLAIM_AUDIT_INTENT,
  claimPendingProductionAudit,
} from "@/lib/production-audit";
import {
  buildPasswordResetRedirectUrl,
  getStandardEmailValidationMessage,
  normalizeEmail,
} from "@/lib/validate-email";
import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

type AuthMode = "sign-in" | "sign-up";
type SignUpType = "candidate" | "business";

const AUTH_INPUT_CLASS =
  "w-full bg-background border border-border rounded-md px-4 py-2.5 text-textMain placeholder:text-textMuted placeholder:opacity-100 caret-white focus:outline-none focus:border-border transition-colors";

const AUTH_PRIMARY_BUTTON_CLASS =
  "inline-flex w-full items-center justify-center rounded-md bg-brand text-white px-4 py-2.5 text-sm font-medium transition-colors hover:bg-brandHover disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

function tabButtonClass(isActive: boolean) {
  return `py-2 rounded-md text-sm font-medium tracking-tight transition-colors duration-200 ease-out cursor-pointer ${
    isActive
      ? "bg-white/10 text-white border border-border"
      : "border border-transparent text-textMuted hover:text-textMain hover:bg-white/5"
  }`;
}

function BackToHomeLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-1 text-sm text-textMuted hover:text-textMain transition-colors duration-200 ease-out ${className}`}
    >
      ← Back to Home
    </Link>
  );
}

function appendAuthQuery(
  path: string,
  search: string
): string {
  const params = new URLSearchParams(search);
  const verified = params.get("employer_verified");
  const verifyError = params.get("verify_error");
  const url = new URL(path, "https://getprovix.com");

  if (verified && !url.searchParams.has("employer_verified")) {
    url.searchParams.set("employer_verified", verified);
  }
  if (verifyError && !url.searchParams.has("verify_error")) {
    url.searchParams.set("verify_error", verifyError);
  }

  return `${url.pathname}${url.search}`;
}

async function destinationAfterAuth(
  user: User,
  search: string,
  signupKind?: SignUpType
): Promise<string> {
  const profileKind = await loadProfileAccountKind(supabase, user.id);
  const role =
    signupKind === "business"
      ? "employer"
      : profileKind;
  const params = new URLSearchParams(search);
  const destination = resolvePostAuthDestination({
    role,
    requestedNext: params.get("next"),
    isAdmin: getPostLoginPath(user) === "/admin",
  });

  return appendAuthQuery(destination, search);
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetEmailError, setResetEmailError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isClaimAudit, setIsClaimAudit] = useState(false);

  useEffect(() => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    if (params.get("intent")?.trim() === CLAIM_AUDIT_INTENT) {
      setMode("sign-up");
      setIsClaimAudit(true);
    } else if (signupRoleFromSearch(search)) {
      setMode("sign-up");
    }
    const authError = params.get("error")?.trim();
    if (!authError) {
      return;
    }

    setError(authError);
    params.delete("error");
    const remaining = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${remaining ? `?${remaining}` : ""}`
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        window.location.href = "/update-password";
      }
    });

    const prepareLogin = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        // If this page rendered, middleware did not confirm a cookie session.
        // Clear leftover client tokens so they cannot bounce us to `/dashboard` then `/`.
        if (error || data.user) {
          await supabase.auth.signOut({ scope: "local" });
        }
      } catch (err) {
        console.error("Login session check failed:", err);
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          // Ignore cleanup failures and still show the form.
        }
      } finally {
        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    };

    void prepareLogin();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setShowResetPassword(false);
    setError(null);
    setMessage(null);
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setResetEmailError(null);

    const trimmedEmail = normalizeEmail(resetEmail);
    setResetEmail(trimmedEmail);

    const validationMessage = getStandardEmailValidationMessage(trimmedEmail);
    if (validationMessage) {
      setResetEmailError(validationMessage);
      return;
    }

    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      trimmedEmail,
      {
        redirectTo: buildPasswordResetRedirectUrl(window.location.origin),
      }
    );

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setMessage("Check your email for a password reset link.");
  };

  const redirectAfterAuth = async (
    user: User | null | undefined,
    signupKind?: SignUpType
  ) => {
    await supabase.auth.getSession();
    if (user && signupKind !== "business" && !isEmployerSignup(user)) {
      await claimPendingProductionAudit();
    }
    const destination = user
      ? await destinationAfterAuth(user, window.location.search, signupKind)
      : getPostLoginPath(user);
    router.refresh();
    router.push(destination);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (mode === "sign-up" && (!firstName.trim() || !lastName.trim())) {
      setError("Enter your first and last name.");
      return;
    }

    const trimmedEmail = normalizeEmail(email);
    setEmail(trimmedEmail);
    const emailError = getStandardEmailValidationMessage(trimmedEmail);
    if (emailError) {
      setError(emailError);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    if (mode === "sign-in") {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      try {
        await redirectAfterAuth(data.session?.user ?? null);
      } catch (redirectError) {
        console.error("Post-login redirect failed:", redirectError);
        setError("Signed in, but we could not redirect you. Please refresh and try again.");
        setLoading(false);
      }
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (!data.session) {
      setLoading(false);
      setMessage("Check your email to confirm your account.");
      setMode("sign-in");
      return;
    }

    try {
      await redirectAfterAuth(data.session?.user ?? null);
    } catch (redirectError) {
      console.error("Post-signup redirect failed:", redirectError);
      setError("Account created, but we could not redirect you. Please refresh and try again.");
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-textMuted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-md px-6">
        <BackToHomeLink className="mb-4" />
        <div className="rounded-md border border-border bg-panel p-8">
          <div className="flex justify-center mb-6">
            <Link href="/" className="hover:opacity-90 transition-opacity">
              <ProvixLogo />
            </Link>
          </div>
          <h1 className="text-2xl font-extrabold text-textMain tracking-tight text-center">
            {showResetPassword
              ? "Reset Password"
              : isClaimAudit
                ? "Claim your verified scorecard"
                : "Welcome to Provix"}
          </h1>
          <p className="text-sm text-textMuted text-center mb-8 mt-3">
            {showResetPassword
              ? "Enter your email to receive a password reset link"
              : isClaimAudit
                ? "Sign in or create an account to attach this production score to your anonymous developer profile. GitHub is the fastest way."
                : mode === "sign-in"
                  ? "Sign in to access your account"
                  : "Create an account to get started"}
          </p>

          {error && (
            <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-lg px-4 py-2.5">
              {message}
            </div>
          )}

          {!showResetPassword && (
            <>
              <OAuthSignInButtons
                onError={(message) => {
                  setMessage(null);
                  setError(message || null);
                }}
              />
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs font-semibold uppercase tracking-wide text-textMuted">
                  or
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            </>
          )}

          {!showResetPassword && (
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-md border border-border p-1">
              <button
                type="button"
                onClick={() => switchMode("sign-in")}
                className={tabButtonClass(mode === "sign-in")}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode("sign-up")}
                className={tabButtonClass(mode === "sign-up")}
              >
                Sign Up
              </button>
            </div>
          )}

          {showResetPassword ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={handleResetPasswordSubmit}
              noValidate
            >
              <div className="flex flex-col gap-1.5">
                <label htmlFor="resetEmail" className="text-sm font-semibold text-textMain">
                  Email
                </label>
                <input
                  id="resetEmail"
                  type="text"
                  inputMode="email"
                  autoComplete="email"
                  name="resetEmail"
                  placeholder="name@example.com"
                  value={resetEmail}
                  onChange={(e) => {
                    setResetEmail(e.target.value);
                    if (resetEmailError) {
                      setResetEmailError(null);
                    }
                  }}
                  aria-invalid={Boolean(resetEmailError)}
                  className={`${AUTH_INPUT_CLASS} ${
 resetEmailError ? "border-red-500/50" : ""
 }`}
                />
                {resetEmailError && (
                  <p className="text-sm text-red-400">{resetEmailError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`${AUTH_PRIMARY_BUTTON_CLASS} mt-2`}
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowResetPassword(false);
                  setResetEmailError(null);
                  setError(null);
                  setMessage(null);
                }}
                className="text-sm text-textMuted hover:text-textMain font-medium transition-colors duration-200 ease-out cursor-pointer text-center"
              >
                ← Back to Sign In
              </button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
              {mode === "sign-up" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="firstName" className="text-sm font-semibold text-textMain">
                      First Name
                    </label>
                    <input
                      id="firstName"
                      type="text"
                      name="firstName"
                      autoComplete="given-name"
                      placeholder="Jordan"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className={AUTH_INPUT_CLASS}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="lastName" className="text-sm font-semibold text-textMain">
                      Last Name
                    </label>
                    <input
                      id="lastName"
                      type="text"
                      name="lastName"
                      autoComplete="family-name"
                      placeholder="Lee"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className={AUTH_INPUT_CLASS}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-sm font-semibold text-textMain">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={AUTH_INPUT_CLASS}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-sm font-semibold text-textMain">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${AUTH_INPUT_CLASS} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-textMuted hover:text-textMain transition-colors duration-200 ease-out cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" aria-hidden />
                    ) : (
                      <Eye className="w-4 h-4" aria-hidden />
                    )}
                  </button>
                </div>
              </div>

              {mode === "sign-in" && (
                <div className="flex justify-end -mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(normalizeEmail(email));
                      setResetEmailError(null);
                      setShowResetPassword(true);
                      setError(null);
                      setMessage(null);
                    }}
                    className="text-xs font-medium text-textMuted hover:text-textMain transition-colors duration-200 ease-out cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`${AUTH_PRIMARY_BUTTON_CLASS} mt-2`}
              >
                {loading
                  ? "Please wait..."
                  : mode === "sign-in"
                    ? "Sign In"
                    : "Create Account"}
              </button>

              {mode === "sign-up" && (
                <p className="text-xs text-textMuted text-center mt-3 leading-relaxed">
                  By creating an account, you agree to our{" "}
                  <a
                    href="/terms"
                    className="underline text-textMain hover:text-textMain transition-colors duration-200"
                  >
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a
                    href="/privacy"
                    className="underline text-textMain hover:text-textMain transition-colors duration-200"
                  >
                    Privacy Policy
                  </a>
                  .
                </p>
              )}
            </form>
          )}

          {!showResetPassword && (
            <p className="mt-6 pt-6 border-t border-border text-center text-sm text-textMuted">
              {mode === "sign-in" ? (
                <>
                  No account?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("sign-up")}
                    className="text-textMain hover:text-textMuted font-semibold transition-colors duration-200 ease-out cursor-pointer"
                  >
                    Sign up here
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("sign-in")}
                    className="text-textMain hover:text-textMuted font-semibold transition-colors duration-200 ease-out cursor-pointer"
                  >
                    Sign in here
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
