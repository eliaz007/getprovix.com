"use client";

import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { ProvixLogo } from "@/components/ProvixLogo";
import { getPostLoginPath } from "@/lib/admin-access";
import {
  isEmployerSignup,
  signupMetadataForKind,
  syncEmployerProfileAfterSignup,
} from "@/lib/account-role";
import {
  buildPasswordResetRedirectUrl,
  getStandardEmailValidationMessage,
  normalizeEmail,
} from "@/lib/validate-email";
import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

type AuthMode = "sign-in" | "sign-up";
type SignUpType = "candidate" | "business";

function BackToHomeLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors ${className}`}
    >
      ← Back to Home
    </Link>
  );
}

function hasAuthEmail(
  value: User | null | undefined
): value is User & { email: string } {
  return Boolean(value && value.email && value.email.trim());
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [signUpType, setSignUpType] = useState<SignUpType>("candidate");
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

  useEffect(() => {
    const handleSession = (session: Session | null, event?: string) => {
      if (event === "PASSWORD_RECOVERY") {
        window.location.href = "/update-password";
        return;
      }

      if (hasAuthEmail(session?.user ?? null)) {
        window.location.href = getPostLoginPath(session!.user);
        return;
      }

      setCheckingSession(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      handleSession(session, event);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("error")?.trim();

    if (!authError) {
      return;
    }

    setError(authError);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setSignUpType("candidate");
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

  const redirectAfterAuth = async (user: User | null | undefined) => {
    await supabase.auth.getSession();
    const destination = getPostLoginPath(user);
    router.refresh();
    router.push(destination);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    if (mode === "sign-in") {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
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
      email,
      password,
      options: {
        data: signupMetadataForKind(signUpType, {
          first_name: firstName,
          last_name: lastName,
        }),
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.session?.user && isEmployerSignup(data.session.user)) {
      await syncEmployerProfileAfterSignup(supabase, data.session.user.id);
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
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-full max-w-md px-6">
        <BackToHomeLink className="mb-4" />
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-8">
          <div className="flex justify-center mb-6">
            <Link href="/" className="hover:opacity-90 transition-opacity">
              <ProvixLogo />
            </Link>
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight text-center">
            {showResetPassword ? "Reset Password" : "Welcome to Provix"}
          </h1>
          <p className="text-sm text-zinc-400 text-center mb-8">
            {showResetPassword
              ? "Enter your email to receive a password reset link"
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
              <GoogleSignInButton
                onError={(message) => {
                  setMessage(null);
                  setError(message || null);
                }}
              />
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-zinc-800" />
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  or
                </span>
                <div className="h-px flex-1 bg-zinc-800" />
              </div>
            </>
          )}

          {!showResetPassword && (
          <div className="grid grid-cols-2 gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1 mb-6">
            <button
              type="button"
              onClick={() => switchMode("sign-in")}
              className={`py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                mode === "sign-in"
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode("sign-up")}
              className={`py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                mode === "sign-up"
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Sign Up
            </button>
          </div>
          )}

          {!showResetPassword && mode === "sign-up" && (
            <div className="grid grid-cols-2 gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1 mb-6">
              <button
                type="button"
                onClick={() => setSignUpType("candidate")}
                className={`py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  signUpType === "candidate"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Candidate Sign Up
              </button>
              <button
                type="button"
                onClick={() => setSignUpType("business")}
                className={`py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  signUpType === "business"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Business Sign Up
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
                <label htmlFor="resetEmail" className="text-sm font-medium text-zinc-300">
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
                  className={`bg-zinc-950 border rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                    resetEmailError ? "border-red-500/50" : "border-zinc-800"
                  }`}
                />
                {resetEmailError && (
                  <p className="text-sm text-red-400">{resetEmailError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors mt-2 cursor-pointer"
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
                className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors cursor-pointer text-center"
              >
                ← Back to Sign In
              </button>
            </form>
          ) : (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            {mode === "sign-up" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="firstName" className="text-sm font-medium text-zinc-300">
                    First Name
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    name="firstName"
                    placeholder="Jordan"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="lastName" className="text-sm font-medium text-zinc-300">
                    Last Name
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    name="lastName"
                    placeholder="Lee"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-zinc-300">
                {mode === "sign-up" && signUpType === "business" ? "Work Email" : "Email"}
              </label>
              <input
                id="email"
                type="email"
                name="email"
                placeholder="name@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-zinc-300">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-4 pr-11 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
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
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors mt-2 cursor-pointer"
            >
              {loading
                ? "Please wait..."
                : mode === "sign-in"
                ? "Sign In"
                : signUpType === "business"
                ? "Create Business Account"
                : "Create Account"}
            </button>

            {mode === "sign-up" && (
              <p className="text-xs text-zinc-400 text-center mt-3 leading-relaxed">
                By creating an account, you agree to our{" "}
                <a
                  href="/terms"
                  className="underline text-zinc-300 hover:text-white"
                >
                  Terms of Service
                </a>{" "}
                and{" "}
                <a
                  href="/privacy"
                  className="underline text-zinc-300 hover:text-white"
                >
                  Privacy Policy
                </a>
                .
              </p>
            )}
          </form>
          )}

          {!showResetPassword && (
          <p className="mt-6 pt-6 border-t border-zinc-800 text-center text-sm text-zinc-400">
            {mode === "sign-in" ? (
              <>
                No account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("sign-up")}
                  className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors cursor-pointer"
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
                  className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors cursor-pointer"
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
